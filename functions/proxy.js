// functions/proxy.js
const fetch = require('node-fetch');

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
    const res  = await fetch(decodeURIComponent(target));
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type':        res.headers.get('content-type') || 'text/plain'
      },
      body
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Proxy error: ' + err.message
    };
  }
};
