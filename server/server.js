const express = require('express');
const fetch = require('node-fetch');

const path = require('path');
const fs = require('fs');

const app = express();
const port = 3001;

/* API Server */

app.use(express.json());

app.get("/api/cases", async (request, response) => {
	let data = await fetch("https://sampo.thl.fi/pivot/prod/fi/epirapo/covid19case/fact_epirapo_covid19case.json?row=hcdmunicipality2020-445222&column=dateweek20200101-509030");
	let json = await data.json();
	response.send(json);
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