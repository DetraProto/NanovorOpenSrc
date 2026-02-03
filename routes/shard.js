/**
 * Shard list service - GET /scws/
 */

function registerShard(app) {
    app.get('/scws/', (req, res) => {
        console.log('Shard list request received');
        console.log('Shard list request headers:', req.headers);
        console.log('Shard list request query:', req.query);

        const shardList = `<?xml version="1.0" encoding="UTF-8"?>
<shard-list xmlns="http://127.0.0.1:8443/xsd/shard/shard-list.xsd">
  <shard>
    <name>Tank</name>
    <url>127.0.0.1</url>
    <max-capacity>1000</max-capacity>
    <used-capacity>10</used-capacity>
    <nice>1</nice>
    <population>Tank</population>
    <locales>
      <locale>en-US</locale>
    </locales>
  </shard>
</shard-list>`;

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.send(shardList);
        console.log('Shard list response sent successfully');
    });
}

module.exports = registerShard;
