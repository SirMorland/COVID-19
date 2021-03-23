import React from 'react';

class App extends React.Component {
	async componentDidMount() {
		let data = await fetch("/api/cases");
		let json = await data.json();
		console.log(json);
	}

	render() {
		return (
			<h1>COVID-19</h1>
		);
	}
}

export default App;
