export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    message: 'NSE API is running',
    timestamp: new Date().toISOString(),
  });
}
