// functions/proxy.js
const fetch = require('node-fetch');

exports.handler = async function(event) {
  // ?target=인코딩된_URL 을 읽어옵니다.
  const { target } = event.queryStringParameters || {};
  if (!target) {
    return { statusCode: 400, body: 'Missing target query parameter' };
  }
  try {
    // 디코딩된 URL 로 실제 요청
    const res = await fetch(decodeURIComponent(target));
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',           // CORS 허용
        'Content-Type': res.headers.get('content-type')
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
};
