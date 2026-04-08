const { createAnthropic } = require('./node_modules/@ai-sdk/anthropic/dist/index.js');
const { streamText } = require('./node_modules/ai/dist/index.js');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'delta', 'delta_data', 'config.json'), 'utf8'));
const provider = createAnthropic({ apiKey: config.anthropic });
console.log('provider type', typeof provider);
const model = provider('claude-3-5-sonnet-latest');
console.log('model doStream', typeof model.doStream, 'model run', typeof model.run);
(async () => {
  try {
    const res = streamText({ model, temperature: 0.7, topP: 1, messages: [{ role: 'user', content: 'hello' }] });
    let count = 0;
    for await (const chunk of res.textStream) {
      console.log('chunk', JSON.stringify(chunk));
      count++;
      if (count > 5) break;
    }
    console.log('done', count);
  } catch (e) {
    console.error('err', e);
    process.exit(1);
  }
})();
