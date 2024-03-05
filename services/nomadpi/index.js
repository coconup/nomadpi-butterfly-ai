const { Service } = require('butterfly-ai');

const coreApiRootUrl = process.env.CORE_API_ROOT_URL;

if(!coreApiRootUrl) {
  throw new Error('CORE_API_ROOT_URL environment variable is required');
}

const headers = {
  'Origin': 'http://localhost:3000'
};

class NomadPiService extends Service(__dirname) {
  get resourceNames() {
    return {
      relay: 'relays',
      wifi_relay: 'wifi_relays',
      action_switch: 'action_switches',
      mode: 'modes',
      water_tank: 'water_tanks',
      sensor: 'sensors',
      battery: 'batteries',
      camera: 'cameras',
      temperature_sensor: 'temperature_sensors',
      solar_charge_controller: 'solar_charge_controllers'
    }
  };

  async handleFunction(functionName, args) {
    if(functionName === 'read_state')
      return this.readState(args);

    if(functionName === 'toggle')
      return this.toggle(args);

    throw new Error(`Invalid endpoint ${functionName}`);
  }

  // Connector endpoints
  async readState(payload) {
    const {
      source_id,
      original_prompt
    } = this.validateParams(
      payload,
      {
        source_id: { required: true },
        original_prompt: { required: true }
      }
    );

    let state;
    if(source_id === 'gps') {
      state = await this.getRequest(`${coreApiRootUrl}/gps/state`, headers);
    } else {
      const [
        resourceType,
        resourceId
      ] = source_id.split('-');
      
      const resourceName = this.resourceNames[resourceType];
      const resourcesState = await this.getRequest(`${coreApiRootUrl}/${resourceName}/state`, headers);

      state = resourcesState[resourceId];
    }

    const prompt = await this.getPrompt('read_state', { original_prompt, state });
    const result = await this.llm.client.query(prompt, { ttsTarget: true });

    return result;
  }

  async toggle(payload, res) {
    const {
      switch_name,
      state
    } = this.validateParams(
      payload,
      {
        switch_name: { required: true },
        state: { required: true }
      }
    );

    const [
      switchType,
      switchId
    ] = switch_name.split('-');

    const resourceName = this.resourceNames[switchType];
    const result = await this.postRequest(`${coreApiRootUrl}/${resourceName}/${switchId}/state`, { state: state === 'on', actor: switch_name }, headers);

    return result;
  }

  // Support functions
  async getSwitch(switchType, switchId) {
    const switches = await this.getRequest(`${coreApiRootUrl}/${switchType}`, headers);
    return switches.find(item => item.id === switchId);
  }

  // Manifest functions
  async getUsedSwitches() {
    const switchGroups = await this.getRequest(`${coreApiRootUrl}/switch_groups`, headers);
    const usedSwitches = switchGroups.map(({switches: jsonString}) => JSON.parse(jsonString)).flat();

    const switchTypes = [
      'relays',
      'wifi_relays',
      'modes',
      'action_switches'
    ];

    const switches = await Promise.all(switchTypes.map(switchType => {
      return (
        this.getRequest(`${coreApiRootUrl}/${switchType}`, headers)
          .then(result => {
            return result.map(({ id, name }) => {
              let type;
              if(switchType === 'relays') type = 'relay';
              if(switchType === 'wifi_relays') type = 'wifi_relay';
              if(switchType === 'modes') type = 'mode';
              if(switchType === 'action_switches') type = 'action_switch';

              return {
                type,
                id,
                name
              }
            })
          })
      );
    }));

    return (
      switches
        .flat()
        .filter(({id, type}) => usedSwitches.find(({ switch_type, switch_id }) => {
          return switch_type === type && switch_id === id;
        }))
    );
  };

  async butterflySwitchOptions() {
    const switchGroups = await this.getRequest(`${coreApiRootUrl}/switch_groups`, headers);

    if(switchGroups.error) {
      throw new Error('Error fetching `switch_groups`')
    } else {
      const switches = await this.getUsedSwitches();
      return switches.map(({ type, id, name }) => {
        return {
          value: `${type}-${id}`,
          aliases: [name]
        }
      })
    }
  };

  async butterflyStateSourceOptions() {
    const apiData = await Promise.all([
      this.getRequest(`${coreApiRootUrl}/water_tanks`, headers),
      this.getRequest(`${coreApiRootUrl}/sensors`, headers),
      this.getRequest(`${coreApiRootUrl}/batteries`, headers),
      this.getRequest(`${coreApiRootUrl}/cameras`, headers),
      this.getRequest(`${coreApiRootUrl}/temperature_sensors`, headers),
      this.getRequest(`${coreApiRootUrl}/solar_charge_controllers`, headers),
      this.getUsedSwitches()
    ]);

    if(apiData.find(({ error }) => !!error)) {
      throw `Error fetching data from the API`
    } else {
      const [
        waterTanksData,
        sensorsData,
        batteriesData,
        camerasData,
        temperatureSensorsData,
        solarChargeControllersData,
        switchesData,
      ] = apiData;

      let options = [
        {
          value: 'gps',
          aliases: ['Location', 'Position', 'Current location', 'Geolocation']
        }
      ];

      waterTanksData.forEach(({ id, name }) => {
        options.push({
          value: `water_tank-${id}`,
          aliases: [name, `${name} tank`, `${name} water tank`, `${name} level`, `${name} remaining water`, `${name} left water`]
        })
      });

      sensorsData.forEach(({ id, sensor_type, name }) => {
        options.push({
          value: `sensor-${id}`,
          aliases: [name, `${sensor_type} ${name}`]
        })
      });

      batteriesData.forEach(({ id, name }) => {
        options.push({
          value: `battery-${id}`,
          aliases: [name, `${name} battery`]
        })
      });

      camerasData.forEach(({ id, name }) => {
        options.push({
          value: `camera-${id}`,
          aliases: [name, `${name} camera`]
        })
      });

      temperatureSensorsData.forEach(({ id, name }) => {
        options.push({
          value: `temperature_sensor-${id}`,
          aliases: [name, `${name} temperature`]
        })
      });

      solarChargeControllersData.forEach(({ id, name }) => {
        options.push({
          value: `solar_charge_controller-${id}`,
          aliases: [name, `${name} solar charger`, `${name} mppt charger`, `${name} charger`]
        })
      });

      switchesData.forEach(({ type, id, name }) => {
        options.push({
          value: `${type}-${id}`,
          aliases: [
            name, 
            `${name} switch`, 
            ...type === 'mode' ? [`${name} mode`] : []
          ]
        })
      })

      return options;
    }
  }
}

module.exports = NomadPiService;
