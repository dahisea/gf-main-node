export default function handler(req, res) {
  // 获取所有传入的headers
  const headers = req.headers;
  
  // 构建HTML响应
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Request Headers</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        tr:hover { background-color: #f5f5f5; }
      </style>
    </head>
    <body>
      <h1>HTTP Request Headers</h1>
      <table>
        <tr>
          <th>Header Name</th>
          <th>Header Value</th>
        </tr>
        ${Object.entries(headers)
          .map(([name, value]) => `
            <tr>
              <td><code>${name}</code></td>
              <td><code>${value}</code></td>
            </tr>
          `)
          .join('')}
      </table>
      <p><strong>Request Method:</strong> ${req.method}</p>
      <p><strong>Request URL:</strong> ${req.url}</p>
    </body>
    </html>
  `;

  // 设置响应头
  res.setHeader('Content-Type', 'text/html');
  
  // 发送响应
  res.status(200).send(html);
}