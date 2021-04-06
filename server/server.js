const express = require('express');
const fetch = require('node-fetch');
const moment = require('moment');

const path = require('path');
const fs = require('fs');
const { promisify } = require("util");

const app = express();
const port = 3001;

const REDIS_OPTIONS = {};
const redis = require("redis");
const client = redis.createClient(REDIS_OPTIONS);
client.get = promisify(client.get);
client.lrange = promisify(client.lrange);
client.hgetall = promisify(client.hgetall);

// client.flushdb();

/* API Server */

app.use(express.json());

const CACHE_AGE = 0; // 60 * 60 * 1000 // 1 hour

const THL_URL = (hcdmunicipality2020, dateweek20200101) => `https://sampo.thl.fi/pivot/prod/fi/epirapo/covid19case/fact_epirapo_covid19case.json?row=hcdmunicipality2020-${hcdmunicipality2020 || 445222}&column=dateweek20200101-${dateweek20200101 || 509030}`;

let fetchMunicipalityWeek = async (hcdmunicipality2020, dateweek20200101, save) => {
	let json;
	if(save) {
		try {
			let file = fs.readFileSync(`./dump/fact_epirapo_covid19case-${hcdmunicipality2020}-${dateweek20200101}.json`);
			json = JSON.parse(file);
		} catch (e) {
			console.log(`Failed reading ${hcdmunicipality2020}-${dateweek20200101} from file, trying to fetch from THL`);
			try {
				let response = await fetch(THL_URL(hcdmunicipality2020, dateweek20200101));
				json = await response.json();
				fs.writeFileSync(`./dump/fact_epirapo_covid19case-${hcdmunicipality2020}-${dateweek20200101}.json`, JSON.stringify(json), () => {});
				console.log(`Fetching ${hcdmunicipality2020}-${dateweek20200101} success!`);
			} catch (e) {
				console.log(`Fetching ${hcdmunicipality2020}-${dateweek20200101} from THL failed, returning...`);
				return {
					hcdData: null,
					municipalityData: null
				};
			}
		}
	} else {
		try {
			let response = await fetch(THL_URL(hcdmunicipality2020, dateweek20200101));
			json = await response.json();
			fs.writeFileSync(`./dump/fact_epirapo_covid19case-${hcdmunicipality2020}-${dateweek20200101}.json`, JSON.stringify(json), () => {});
		} catch (e) {
			console.log(`Failed fetching ${hcdmunicipality2020}-${dateweek20200101} from THL, trying to read from file`);
			try {
				let file = fs.readFileSync(`./dump/fact_epirapo_covid19case-${hcdmunicipality2020}-${dateweek20200101}.json`);
				json = JSON.parse(file);
				console.log(`Reading ${hcdmunicipality2020}-${dateweek20200101} success!`);
			} catch (e) {
				console.log(`Reading ${hcdmunicipality2020}-${dateweek20200101} from file failed, returning...`);
				return {
					hcdData: null,
					municipalityData: null
				};
			}
		}
	}

	let dimension = json.dataset.dimension;
	let axis = {};
	dimension.id.forEach(id => {
		axis[id] = [];
		Object.keys(dimension[id].category.index).forEach(key => {
			axis[id][dimension[id].category.index[key]] = {
				id: key,
				label: dimension[id].category.label[key]
			}
		});
	});
	
	let hcdData = {
		label: "",
		data: {}
	};
	let municipalityData = {};
	for(let y = 0; y < axis.hcdmunicipality2020.length; y++) {
		let hcdm = axis.hcdmunicipality2020[y];
		if(hcdm.id === hcdmunicipality2020) {
			hcdData.label = hcdm.label;
		} else {
			municipalityData[hcdm.label] = {};
		}
		
		for(let x = 0; x < axis.dateweek20200101.length; x++) {
			if(axis.dateweek20200101[x].id != dateweek20200101) {
				let bit = json.dataset.value[y * axis.dateweek20200101.length + x];

				if(hcdm.id === hcdmunicipality2020) {
					hcdData.data[axis.dateweek20200101[x].label] = bit ? parseInt(bit) : 0;	
				} else {
					municipalityData[hcdm.label][axis.dateweek20200101[x].label] = bit ? parseInt(bit) : 0;
				}
			}
		}
	}

	return {
		hcdData,
		municipalityData: Object.keys(municipalityData).map(key => ({
			label: key,
			data: municipalityData[key]
		}))
	};
}

app.get("/api/cases", async (request, response) => {
	let lastUpdated = await client.get('last-updated');

	let covidData;

	if(lastUpdated === null || Date.now() - lastUpdated >= CACHE_AGE) {
		let json;

		try {
			let result = await fetch(THL_URL());
			json = await result.json();
			fs.writeFileSync("./dump/fact_epirapo_covid19case.json", JSON.stringify(json), () => {});
		} catch (e) {
			let file = fs.readFileSync('./dump/fact_epirapo_covid19case.json');
			json = JSON.parse(file);
		}
			
		let dimension = json.dataset.dimension;
		let axis = {};
		dimension.id.forEach(id => {
			axis[id] = [];
			Object.keys(dimension[id].category.index).forEach(key => {
				axis[id][dimension[id].category.index[key]] = {
					id: key,
					label: dimension[id].category.label[key]
				};
			});
		});
	
		let data = {};
		for(let i = 0; i < axis.hcdmunicipality2020.length; i++) {
			let hcdmunicipality2020 = axis.hcdmunicipality2020[i];
			if(hcdmunicipality2020.id == 445222) { // 445222 is ID for "All areas", let's just use that since daily data for municipalities is not available
				for(let j = 0; j < axis.dateweek20200101.length; j++) {
					let dateweek20200101 = axis.dateweek20200101[j];

					if(dateweek20200101.id != 509030) { // 509030 is ID for "All time", not wanted here
						let pattern = /\D+(?<year>\d+)\D+(?<week>\d+)/gm;
						let {groups: { year, week }} = pattern.exec(dateweek20200101.label);

						year = parseInt(year);
						week = parseInt(week);

						let today = moment();
						let currentYear = today.year();
						let currentWeek = today.isoWeek();

						let weekAgo = moment().subtract(1, 'week');
						let yearWeekAgo = weekAgo.year();
						let weekWeekAgo = weekAgo.isoWeek();

						let doFetch = false;
						let save = false;
						if((year < yearWeekAgo) || (year === yearWeekAgo && week < weekWeekAgo)) {
							doFetch = true;
							save = true;
						}
						if((year === yearWeekAgo && week === weekWeekAgo) || (year === currentYear && week === currentWeek)) {
							doFetch = true;
							save = false;
						}

						if(doFetch) {
							let {hcdData, municipalityData} = await fetchMunicipalityWeek(hcdmunicipality2020.id, dateweek20200101.id, save);

							if(hcdData && municipalityData) {
								if(!data[hcdData.label]) {
									data[hcdData.label] = {
										data: {},
										municipalities: {}
			};
								}
	
								Object.assign(data[hcdData.label].data, hcdData.data);
								
								municipalityData.forEach(municipality => {
									if(!data[hcdData.label].municipalities[municipality.label]) {
										data[hcdData.label].municipalities[municipality.label] = {};
									}
									
									Object.assign(data[hcdData.label].municipalities[municipality.label], municipality.data);
								});
							}
						}
					}
				}
			}
		}

		covidData = Object.keys(data).map(hcd => {
			let hcdm = data[hcd];
			return {
				label: hcd,
				data: hcdm.data,
				municipalities: Object.keys(hcdm.municipalities).map(municipality => ({
					label: municipality,
					data: hcdm.municipalities[municipality]
				}))
			};
		});

		/*
		covidData.forEach(hcd => {
			let d = [];
			Object.keys(hcd.data).forEach(key => {
				d.push(key);
				d.push(hcd.data[key]);
			});
			client.hmset(key, d);
		});

		client.rpush('municipalities', municipalities);

		client.set('last-updated', Date.now());
		*/
	} else {
		covidData = [];

		let municipalities = await client.lrange('municipalities', 0, -1);

		for(let i = 0; i < municipalities.length; i++) {
			let municipality = municipalities[i];

			let data = await client.hgetall(municipality);
			covidData.push({
				label: municipality,
				data
			});
		}
	}

	covidData.forEach(hcd => {
		let data = {};
		let cumulative = 0;
		Object.keys(hcd.data).sort((a, b) => a.localeCompare(b)).forEach(key => {
			let bit = hcd.data[key];
			let cases = bit ? parseInt(bit) : 0;
			cumulative += cases;
			data[key] = {
				cases,
				cumulative
			};
			});
		hcd.data = data;

		hcd.municipalities.forEach(municipality => {
			let data = {};
			let cumulative = 0;
			Object.keys(municipality.data).sort((a, b) => a.localeCompare(b)).forEach(key => {
				let bit = municipality.data[key];
				let cases = bit ? parseInt(bit) : 0;
				cumulative += cases;
				data[key] = {
					cases,
					cumulative
				};
		});
		municipality.data = data;
	});
	});
	
	response.send(covidData || {});
});

/* Start React front end on production */

if(process.env.NODE_ENV === "production") {
	app.use("/", express.static('build'));

	app.get("*", (_, response) => {
		const filePath = path.resolve(__dirname, './build', 'index.html');

		fs.readFile(filePath, 'utf8', (error, data) => {
			if (error) {
				return console.log(err);
			}

			response.send(data);
		});
	});
}

/* Start server */

app.listen(port, () => console.log(`Listening on port ${port}`));