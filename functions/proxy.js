// functions/proxy.js

// Netlify Node.js 18 런타임을 명시
export const config = { runtime: 'nodejs18.x' };

// CommonJS 가 아닌 ESM 방식으로 내보내기
export default async function handler(event) {
  const { target } = event.queryStringParameters || {};
  if (!target) {
    return {
      statusCode: 400,
      body: 'Missing target query parameter'
    };
  }
  try {
    // 내장 fetch 사용
    const res  = await fetch(decodeURIComponent(target));
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': res.headers.get('content-type') || 'text/plain'
      },
      body
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Proxy error: ' + err.message
    };
  }
}
