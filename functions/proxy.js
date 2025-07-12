// functions/proxy.js

exports.handler = async function(event) {
  const target = event.queryStringParameters?.target;
  if (!target) {
    return {
      statusCode: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Missing target query parameter'
    };
  }

  try {
    // Node.js18+ 에 내장된 fetch 사용
    const res  = await fetch(decodeURIComponent(target));
    const text = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': res.headers.get('content-type') || 'text/plain'
      },
      body: text
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Proxy error: ' + err.message
    };
  }
};
