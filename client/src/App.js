import React from 'react';
import { Bar, Line } from 'react-chartjs-2';

class App extends React.Component {
	constructor() {
		super();

		this.state = {
			data: []
		}
	}

	async componentDidMount() {
		let data = await fetch("/api/cases");
		let json = await data.json();
		this.setState({
			data: json[json.length - 1].data
		});
	}

	render() {
		let labels = [];
		let cases = [];
		let cumulative = [];

		console.log(this.state.data);

		this.state.data.forEach(row => {
			labels.push(row.date);
			cases.push(row.cases);
			cumulative.push(row.cumulative);
		});

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
				backgroundColor: '#f66'
			}]
		};

		return (
			<React.Fragment>
				<h1>COVID-19 in Finland</h1>
				<div className="dashboard">
					<div>
						<h2>Weekly cases</h2>
						<Bar
							data={barData}
							options={{ aspectRatio: 1, maintainAspectRatio: true, legend: {display: false} }}
						/>
					</div>
					<div>
						<h2>Cumulative cases</h2>
						<Line
							data={lineData}
							options={{ aspectRatio: 1, maintainAspectRatio: true, legend: {display: false} }}
						/>
					</div>
				</div>
			</React.Fragment>
		);
	}
}

export default App;
