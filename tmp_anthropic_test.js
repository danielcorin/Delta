const anthropic = require('@ai-sdk/anthropic');
const fs = require('fs');
const path = require('path');
const config = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, 'delta', 'delta_data', 'config.json'), 'utf8'));
const provider = anthropic.createAnthropic({ apiKey: config.anthropic });
const models = ['claude-3-opus-latest','claude-3-5-sonnet-latest','claude-4-sonnet-20250514','claude-3-5-haiku-latest'];
(async () => {
  for (const modelId of models) {
    try {
      console.log('testing', modelId);
      const m = provider(modelId);
      const args = await m.getArgs({ mode: { type: 'regular' }, inputFormat: 'messages', prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] });
      console.log('getArgs ok', modelId, JSON.stringify(args.args));
      try {
        const res = await m.doStream({ mode: { type: 'regular' }, inputFormat: 'messages', prompt: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }] });
        const reader = res.stream.getReader();
        let i = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          i++;
        }
        console.log('stream finished', modelId, 'chunks=' + i);
      } catch (e) {
        console.error('doStream error', modelId, e.message || e);
      }
    } catch (e) {
      console.error('error', modelId, e.message || e);
    }
  }
})();
