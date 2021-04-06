import React, { useState, useEffect } from 'react';
import { LatLng, circleMarker, DomEvent } from 'leaflet';
import { MapContainer, TileLayer, GeoJSON, useMapEvents } from 'react-leaflet';
import randomPointsOnPolygon from 'random-points-on-polygon';
import moment from 'moment';
import { Bar, Line } from 'react-chartjs-2';

import HCDRegions from './hcd-regions.json';

const App = () => {
	const [data, setData] = useState({});
	const [hcds, setHDCs] = useState({});
	const [softSelect, setSoftSelect] = useState(null);
	const [hardSelect, setHardSelect] = useState(null);
	const [selectedDate, setSelectedDate] = useState(moment().format('yyyy-MM-DD'));

	let barChartRef = {};
	let lineChartRef = {};

	useEffect(() => {
		const fetchData = async () => {
			let data = await fetch("/api/cases");
			let json = await data.json();
			
			let hcds = {};
			json[0].municipalities.forEach(municipality => {
				hcds[municipality.label] = municipality.data;
			});
			
			setData(json[0].data);
			setHDCs(hcds);
		}

		fetchData();
	}, []);

	let chartData = data;
	let selected = "All Areas";
	if(softSelect) {
		chartData = hcds[softSelect];
		selected = softSelect;
	}
	if(hardSelect) {
		chartData = hcds[hardSelect];
		selected = hardSelect;
	}

	let labels = [];
	let cases = [];
	let cumulative = [];

	let today = moment();
	let date = moment().subtract(1, 'month');
	for(; date < today; date.add(1, 'day')) {
		let f = date.format('yyyy-MM-DD');
		labels.push(f);
		cases.push(chartData[f] ? chartData[f].cases : 0);
		cumulative.push(chartData[f] ? chartData[f].cumulative : 0);
	}

	let barData = {
		labels,
		datasets: [{
			label: "Daily cases",
			data: cases,
			borderColor: '#f66',
			backgroundColor: '#f66'
		}]
	};

	let lineData = {
		labels,
		datasets: [{
			label: "Cumulative cases",
			data: cumulative,
			borderColor: '#f66',
			backgroundColor: "transparent"
		}]
	};

	let options = {
		responsive: true,
		maintainAspectRatio: false,
		legend: {
			display: false
		},
		scales: {
			yAxes: [{
				ticks: {
					min: 0
				}
			}]
		}
	};

	const onBarHover = event => {
		let chartElem = barChartRef.chartInstance.getElementAtEvent(event);
		if(chartElem.length > 0) {
			onHover(chartElem[0]);
		}
	}
	const onLineHover = event => {
		let chartElem = lineChartRef.chartInstance.getElementAtEvent(event);
		if(chartElem.length > 0) {
			onHover(chartElem[0]);
		}
	}
	const onHover = chartElem => {
		setSelectedDate(chartElem._chart.config.data.labels[chartElem._index]);
	}

	return (
		<React.Fragment>
			<h1>COVID-19 cases in Finland</h1>

			<div id="grid">
				<MapContainer bounds={[[70.092283, 19.131067], [59.504017, 31.5867]]} maxZoom={9} minZoom={6} >
					<MapContent hcds={hcds} yyyyMMDD={selectedDate} selected={selected} setSoftSelect={setSoftSelect} setHardSelect={setHardSelect} />
				</MapContainer>
				<div className="chart">
					<h2>Weekly cases @ {selected}</h2>
					<div>
						<Bar
							ref={ref => barChartRef = ref}
							data={barData} height={null} width={null} onElementsHover={event => console.log(event)}
							options={{...options, onHover: onBarHover}}
						/>
					</div>
				</div>
				<div className="chart">
					<h2>Cumulative cases @ {selected}</h2>
					<div>
						<Line
							ref={ref => lineChartRef = ref}
							data={lineData} height={null} width={null}
							options={{...options, onHover: onLineHover}}
						/>
					</div>
				</div>
			</div>
		</React.Fragment>
	);
}

const MapContent = ({hcds, yyyyMMDD, selected, setSoftSelect, setHardSelect}) => {
	useMapEvents({
		click() {
			setHardSelect(null);
		}
	});

	const coordsToLatLng = coords => {
		return new LatLng(coords[0], coords[1], coords[2]);
	}

	const onEachFeature = (feature, layer) => {
		layer.on('mouseover', () => {
			setSoftSelect(feature.properties.name);
		});
		layer.on('mouseout', () => {
			setSoftSelect(null);
		});
		layer.on('click', event => {
			DomEvent.stopPropagation(event);
			setHardSelect(feature.properties.name);
		});
	}

	const pointToLayer = (feature, latLng) => {
		return circleMarker(latLng, {
			radius: 2,
			fillColor: "#f66",
			color: "#f66",
			weight: 1,
			opacity: 1,
			fillOpacity: 0.8,
			interactive: false
		});
	}

	return (
		<React.Fragment>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
				url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png"
			/>
			{HCDRegions.regions.map((region, index) => {
				let style = {
					fillColor: "#000",
					fillOpacity: 0.1,
					color: selected === region.name ? "#fff" : "#999",
					opacity: selected === region.name ? 1 : 0.5,
					weight: 1
				};

				let cases = hcds[region.name] ? Math.round((hcds[region.name][yyyyMMDD] || {cumulative: 0}).cumulative / 100) : 0;

				return (
					<React.Fragment key={index} >
						{cases &&
							<GeoJSON key={yyyyMMDD} coordsToLatLng={coordsToLatLng} pointToLayer={pointToLayer}
								data={randomPointsOnPolygon(cases, region.geojson)}
							/>
						}
						<GeoJSON key={selected} data={region.geojson} coordsToLatLng={coordsToLatLng} onEachFeature={onEachFeature} style={style} />
					</React.Fragment>
				);
				})}
		</React.Fragment>
	);
}
		
export default App;