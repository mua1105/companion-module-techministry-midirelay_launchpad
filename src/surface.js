const { TCPHelper } = require('@companion-module/base');
const config = require('./config');

module.exports = {
	initSurface() {
		let self = this;

		if (self.SOCKET_COMPANION !== undefined) {
			self.SOCKET_COMPANION.destroy();
			delete self.SOCKET_COMPANION;
		}

		if (self.config.host_companion === undefined) {
			self.config.host_companion = '127.0.0.1';
		}

		if (self.config.port_companion === undefined) {
			self.config.port_companion = 16622;
		}

		if (self.DEVICEID == undefined) {
			self.DEVICEID = self.id;
		}

		if (self.config.host_companion) {
			self.log('info', `Opening Connection to Companion Satellite API: ${self.config.host_companion}:${self.config.port_companion}`);

			self.SOCKET_COMPANION = new TCPHelper(self.config.host_companion, self.config.port_companion);

			self.SOCKET_COMPANION.on('error', (err) => {
				self.log('error', 'Network error with Companion Satellite API: ' + err.message);
			});

			self.SOCKET_COMPANION.on('connect', () => {
				self.log('info', 'Connected to Companion Satellite API');
			});

			self.SOCKET_COMPANION.on('data', function (data) {	
				self.processCompanionData(data);
			});
		}
	},

	CompanionSatellite_Close() {
		let self = this;

		//close socket if it exists
		if (self.SOCKET_COMPANION !== undefined) {
			if (self.config.useAllChannelsAsSurfaces) {
				for (let i = 1; i <= 16; i++) {
					self.sendCompanionSatelliteCommand(`REMOVE-DEVICE DEVICEID=${self.DEVICE_ID}-ch${i.toString().padStart(2, '0')}`);
				}
			}
			else {
				self.sendCompanionSatelliteCommand(`REMOVE-DEVICE DEVICEID=${this.DEVICE_ID}`);
			}

			self.sendCompanionSatelliteCommand('QUIT');
			self.SOCKET_COMPANION.destroy();
			delete self.SOCKET_COMPANION;
		}

		clearInterval(self.COMPANION_PING_INTERVAL);
	},

	delay(ms) {
  		return new Promise(resolve => setTimeout(resolve, ms));
	},

	async processCompanionData(data) {
		let self = this;
		try {
			let str_raw = String(data).trim();
			let str_split = str_raw.split('\n');
			//console.log('lenghth: ', str_split.length)
			for (let index = 0; index < str_split.length; index++) {
				
				//await this.delay(1000);

				let str = str_split[index];
	
				let params = str.split(' ');
				let command = params[0];
	
				// Create a satallite device on first connect
				if (command == 'BEGIN') {
					let productName = 'TechMinistry midi-relay';
					if (false/*self.config.useAllChannelsAsSurfaces*/) {
						for (let i = 1; i <= 16; i++) {
							self.sendCompanionSatelliteCommand(`ADD-DEVICE DEVICEID=${self.DEVICEID}-ch${i.toString().padStart(2, '0')} PRODUCT_NAME="${productName}" KEYS_TOTAL=${self.config.maxKeys} BITMAPS=false COLORS=false TEXT=false`);
						}
					}
					else {
						self.sendCompanionSatelliteCommand(`ADD-DEVICE DEVICEID=${self.DEVICEID} PRODUCT_NAME="${productName}" KEYS_PER_ROW=9 KEYS_TOTAL=81 BITMAPS=false COLORS=rgb TEXT=false BRIGHTNESS=true`);
					}
					continue;
				}
	
				// Device was added
				if (command == 'ADD-DEVICE') {
					if (params[1] == 'OK') {
						self.startCompanionSatellitePing();
					}
					else {
						//probably not ok, throw an error
						self.log('error', 'Error adding device to Companion Satellite API: ' + params[1]);
					}
					continue;
				}

				// Key Changed
				if (command == 'KEY-STATE') {
					console.log(str);
					let keyStateCommand = params[5].split('=')
					let keyNum = Number(keyStateCommand[1]);
					if (params[2].includes('COLOR')) {
						//TODO: Supply current key with Color information
						let colors = params[2].split('"');
						let rgbcolor = colors[1].split(',');
						let r_dirty = rgbcolor[0].split('(');
						let r = Math.round(r_dirty[1] / 85);
						let g = Math.round(rgbcolor[1]/ 85);
						let b = Math.round(rgbcolor[2]/ 85);

						let decimal_color = (g) * 16 + 12 + (r)

						console.log("RGB: ", r, g, b);
						console.log("Decimal", decimal_color);
						
						console.log(keyNum)

						//Calculate the offset for the individual Rows
						if (keyNum >= 0 && keyNum <= 7){
							//These are the round buttons at the top, those are mapped to "ControlChange" messages 104-111
							keyNum = keyNum + 104;
							let channel = 1;
							console.log('CC Num: ', keyNum);
							midiObj = {
								midiport: this.config.midi_output_port,
								midicommand: 'cc',
								channel: (channel-1), //channels are zero-based in midi-relay
								controller: keyNum,
								value: decimal_color
							};

							this.sendCommand('sendmidi', midiObj);
						}
						//Those are the other keys
						else if(keyNum >= 9){
							//Row 0
							if (keyNum >= 9 && keyNum <= 17){
								keyNum = keyNum - 9;
							}

							//Row 1
							else if (keyNum >= 18 && keyNum <= 26){
								keyNum = keyNum - 2;
							}

							//Row 2
							else if (keyNum >= 27 && keyNum <= 35){
								keyNum = keyNum + 5;
							}

							//Row 3
							else if (keyNum >= 36 && keyNum <= 44){
								keyNum = keyNum + 12;
							}

							//Row 4
							else if (keyNum >= 45 && keyNum <= 53){
								keyNum = keyNum + 19;
							}

							//Row 5
							else if (keyNum >= 54 && keyNum <= 62){
								keyNum = keyNum + 26;
							}

							//Row 6
							else if (keyNum >= 63 && keyNum <= 71){
								keyNum = keyNum + 33;
							}

							//Row 7
							else if (keyNum >= 72 && keyNum <= 80){
								keyNum = keyNum + 40;
							}


							let channel = 1;
							let note = keyNum;


							midiObj = {
								midiport: this.config.midi_output_port,
								midicommand: 'noteon',
								channel: (channel-1), //channels are zero-based in midi-relay
								note: note,
								velocity: decimal_color
							};

							this.sendCommand('sendmidi', midiObj);

						}
					}
					
					else {
						//probably not ok, throw an error
						self.log('error', 'Error reading Key Feedback: ' + params[2]);
					}
					continue;
				}
				if (command == 'BRIGHTNESS'){
					
					let resc_dev_id_dirty = params[1].split('=');
					let resc_dev_id = resc_dev_id_dirty[1];
					if(resc_dev_id == '"' + self.DEVICEID + '"'){
						if(self.config.verbose){
							console.log("Brightness recieved!");
						}
						
					}
					
				}



			}
		}
		catch(error) {
			self.log('error', 'Error processing Companion Satellite API data: ' + error.toString());
			console.log(error)
		}
	},

	startCompanionSatellitePing() {
		let self = this;

		self.COMPANION_PING_INTERVAL = setInterval(function () {
			self.sendCompanionSatelliteCommand('PING');
		}, 100);
	},

	sendCompanionSatelliteCommand(cmd) {
		let self = this;

		if (self.SOCKET_COMPANION !== undefined && self.SOCKET_COMPANION.isConnected) {
			if (self.config.verbose) {
				if (cmd !== 'PING') {
					self.log('debug', 'Sending Companion Satellite API Command: ' + cmd);
				}
			}
			self.SOCKET_COMPANION.send(cmd + '\n');
		}
	},
}