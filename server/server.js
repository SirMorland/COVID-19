const express = require('express');
const fetch = require('node-fetch');

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

client.flushdb();

/* API Server */

app.use(express.json());

const CACHE_AGE = 60 * 60 * 1000 // 1 hour

const THL_URL = (hcdmunicipality2020, dateweek20200101) => `https://sampo.thl.fi/pivot/prod/fi/epirapo/covid19case/fact_epirapo_covid19case.json?row=hcdmunicipality2020-${hcdmunicipality2020 || 445222}&column=dateweek20200101-${dateweek20200101 || 509030}`;

app.get("/api/cases", async (request, response) => {
	let lastUpdated = await client.get('last-updated');

	let covidData;

	if(lastUpdated === null || Date.now() - lastUpdated >= CACHE_AGE) {
		console.log("Fetching new");
		
		let json;

		try {
			let result = await fetch(THL_URL());
			json = await result.json();
			fs.writeFile("./dump/fact_epirapo_covid19case.json", result);
		} catch (e) {
			console.log("Fetching failed, using old dump");

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
	
		let data = [];
		for(let y = 0; y < axis.hcdmunicipality2020.length; y++) {
			data[y] = {
				label: axis.hcdmunicipality2020[y].label,
				data: {}
			};
	
			for(let x = 0; x < axis.dateweek20200101.length; x++) {
				if(axis.dateweek20200101[x].id != 509030) { // 509030 is ID for "All time", not wanted here
					let bit = json.dataset.value[y * axis.dateweek20200101.length + x];
					data[y].data[axis.dateweek20200101[x].label] = bit ? parseInt(bit) : 0;
				}
			}
		}

		covidData = data;

		data.forEach(municipality => {
			let d = [];
			Object.keys(municipality.data).forEach(key => {
				d.push(key);
				d.push(municipality.data[key]);
			})
			client.hmset(municipality.label, d);
		});

		client.rpush('municipalities', data.map(a => a.label));

		client.set('last-updated', Date.now());
	} else {
		console.log("Using cache");

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

	covidData.forEach(municipality => {
		let data = [];
		let cumulative = 0;
		Object.keys(municipality.data).forEach(key => {
			let cases = parseInt(municipality.data[key]);
			cumulative += cases;
			data.push({
				date: key,
				cases,
				cumulative
			});
		});
		municipality.data = data;
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