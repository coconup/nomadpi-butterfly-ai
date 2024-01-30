const { Service } = require('butterfly-ai');

class OpenWeatherMapService extends Service(__dirname) {
  constructor(config={}) {
    super();

    const {
      apiKey,
      latitude,
      longitude
    } = config;

    if(!apiKey) {
      throw `\`apiKey\` is a required parameter`;
    }

    this.config = config;
  }

  async handleFunction(functionName, args) {
    if(functionName === 'query')
      return this.query(args);

    throw new Error(`Invalid endpoint ${functionName}`);
  };

  // Connector endpoints
  async query(payload, res) {
    const {
      original_prompt
    } = this.validateParams(
      payload,
      {
        original_prompt: { required: true }
      }
    );

    const prompt = await this.getPrompt('query', { original_prompt });

    if(this.debug) console.log('OPEN WEATHER PROMPT', prompt);

    const result = await this.llm.client.query(prompt, { ttsTarget: true });

    if(this.debug) console.log('OPEN WEATHER RESULT', result);

    return result;
  };

  // Helper functions
  async getWeatherInfo() {
    return await this.getRequest(
      `https://api.openweathermap.org/data/2.5/onecall?lat=${this.config.latitude}&lon=${this.config.longitude}&exclude=current,minutely,hourly&units=metric&appid=908ad75f36452c11ff4306cd53162218`
    );
  };

  getCurrentDate() {
    const options = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    };
    
    const date = new Date();
    return date.toLocaleDateString('en-US', options);
  };
}

module.exports = OpenWeatherMapService;