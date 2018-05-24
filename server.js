require("dotenv").config();
var http = require("http");
var express = require("express");
var path = require("path");
var util = require("util");

const trainApiKey = process.env.CTA_TRAIN_API_KEY;
const busApiKey = process.env.CTA_BUS_API_KEY;
const openWeatherApiKey = process.env.OPEN_WEATHER_MAP_API_KEY;

function getFromUrl(url) {
	return new Promise( (resolve, reject) => {
		http.request(url, (response) => {
			var str = "";
			response.on("data", (chunk) => {
				str += chunk;
			});
			response.on("end", () => {
				resolve(str);
			});
		}).end();
	});

}

const busKey = "Bus";
const trainKey = "Train";
const weatherKey = "Weather";
const o = {};
o[busKey] = [];
o[trainKey] = [];
o[weatherKey] = [];

let busStops = [ "6700" , "6627", "307", "332", "4640", "14487", "6347", "206"];
let trainStations = ["40350"];
let location = "Chicago";

function getBus() {
	let busUrl = "http://ctabustracker.com/bustime/api/v2/getpredictions?format=json&key=" + busApiKey + "&stpid=";
	let busPromises = [];

	// API can accept up to 10 stops per call; want to minimize calls
	for (let i = 0; (10 + i) < busStops.length; i += 10) {

		// Array.slice returns a shallow copy into region of array
		// Doesn't matter if (i+10) > busStops.length
		let stops = busStops.slice(i, i + 10);
		let stopsString = stops.join(",");

		busPromises.push(getFromUrl(busUrl + stopsString).then((result) => {
			let busTimes = {};
			let busJson = JSON.parse(result)["bustime-response"];
			if (busJson.hasOwnProperty("error")) {
				// TODO
				console.log("Error response on busses " + stopsString);
				return;
			}

			// Iterate through all returned predictions
			for (let prd of busJson["prd"]) {
				// Route name is number + 1st letter of direction
				// e.g. 12 Eastbound would be "12E"
				let routeName = prd.rtdd + prd.rtdir.charAt(0);
				if (!busTimes.hasOwnProperty(routeName)) {
					busTimes[routeName] = [];
				}
				busTimes[routeName].push(prd);
			}

			// Now sort all returned predictions by soonest
			for (let prds in busTimes) {
				prds.sort((a, b) => {
					if (a.prdctdn === b.prdctdn) {
						return 0;
					}
					if (a.prdctdn === "DUE") {
						return -1;
					}
					if (b.prdctdn === "DUE") {
						return 1;
					}
					// parseInt() technically not needed due to type coersion, but it's probably a bad idea to trust type coersion
					return parseInt(a.prdctdn, 10) - parseInt(b.prdctdn, 10);
				});
			}
			return busTimes;
		}));

	}
	// Remember that getFromUrl runs asynchronously
	// In cases where there are more than 10 stops being examined, we need
	// to wait for all requests to finish, then merge resulting objects together

	// !!! Assumption: no more than one bus stop per route name !!!
	// If this is false, below code will copy over some values 

	return Promise.all(busPromises).then((allBusTimes) => {
		let returnTimes = {};
		for (let bt of allBusTimes) {
			Object.assign(returnTimes, bt);
		}
		return returnTimes;
	});
	
	// This function now returns a Promise object


	// for (let i=0;i<busStops.length;i++) {
	// 	let busUrl="http://ctabustracker.com/bustime/api/v2/getpredictions?key="+busApiKey+"&stpid="+busStops[i]+"&format=json";
	// 	let busExport = [];
	// 	getFromUrl(busUrl).then((result) => {
	// 		let busJson = JSON.parse(result)["bustime-response"];
	// 		//console.log(busJson);
	// 		for (let j=0;j<busJson["prd"].length;j++) {
	// 			let data = {
	// 				stop: busJson["prd"][j]["rt"],
	// 				route: busJson["prd"][j]["stpnm"],
	// 				dir: busJson["prd"][j]["rtdir"], 
	// 				prdtm: busJson["prd"][j]["prdtm"].split(" ")[1],
	// 				tmstmp: busJson["prd"][j]["tmstmp"].split(" ")[1],
	// 			};
	// 			busExport.push(data);
	// 		}
	// 		o[busKey].push(busExport);
        
	// 	});
	// }
}

function getTrain() {
	for (let i=0;i<trainStations.length;i++) {    
		let trainUrl="http://lapi.transitchicago.com/api/1.0/ttarrivals.aspx?key="+trainApiKey+"&mapid="+trainStations[i]+"&max=5&outputType=JSON";
		let trainExport = [];  
		getFromUrl(trainUrl).then((result) => {
			let trainJson = JSON.parse(result);
			let trainRoute = [];
			let trainStationName = [];
			let trainDestination = [];
			let trainTimeStamp = [];
			let trainPrdictedTime = [];
			for (i=0;i<trainJson["ctatt"]["eta"].length;i++) {
				trainRoute[i] = trainJson["ctatt"]["eta"][i]["rt"];
				trainStationName[i] = trainJson["ctatt"]["eta"][i]["staNm"];
				trainDestination[i] = trainJson["ctatt"]["eta"][i]["stpDe"].split(" ")[2];
				trainTimeStamp[i] = trainJson["ctatt"]["eta"][i]["prdt"].split("T")[1];
				trainPrdictedTime[i] = trainJson["ctatt"]["eta"][i]["arrT"].split("T")[1];
				let data = {
					stop: trainStationName[i],
					route: trainRoute[i],
					dir: trainDestination[i],
					prdtm: trainPrdictedTime[i],
					tmstmp: trainTimeStamp[i],
				};
				trainExport.push(data);
			}
			o[trainKey].push(trainExport);
		});
	}
}

function getWeather() {
	var weatherUrl="http://api.openweathermap.org/data/2.5/weather?q="+location+"&appid="+openWeatherApiKey;
	var weatherExport = [];
	getFromUrl(weatherUrl).then((result) => {
		let weatherJson = JSON.parse(result);
		let weatherCity = weatherJson["name"] + ", " + weatherJson["sys"]["country"];
		let weatherWind = weatherJson["wind"];
		let weatherTemp = weatherJson["main"]["temp"];
		let weatherForecast = [];
		let weatherForecastDescription = [];
		for (let i=0; i<weatherJson["weather"].length;i++) {
			weatherForecast[i] = weatherJson["weather"][i]["main"];
			weatherForecastDescription[i] = weatherJson["weather"][i]["description"];
		}
		let data = {
			location: weatherCity,
			temp: weatherTemp,
			wind: weatherWind,
			forecast: {
				main: weatherForecast,
				description: weatherForecastDescription,
			},
		};
		weatherExport.push(data);
	});
	o[weatherKey].push(weatherExport);
}

const app = express();
const port = 8080;

app.listen(port);

function getData() {
	console.log("getting new data");
	getBus();
	getTrain();
	getWeather();
	setTimeout(() => {
		console.log(util.inspect(o,false,null));
		o[busKey] = [];
		o[trainKey] = [];
		o[weatherKey] = [];
		getData();
	}, 10000);
}

getData();

app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

app.get("/api/all", function(req, res) {
	let bus = req.query.bus;
	let train = req.query.train;
	let city = req.query.city;
	busStops = bus.split(",");
	trainStations = train.split(",") ;
	location = city;
	res.send(o);
});

app.get("/api/bus", function(req, res) {
	let bus = req.query.bus;
	busStops = bus.split(",");
	res.send(o[busKey]);
});

app.get("/api/bus/:busnum", function(req, res) {});

app.get("/api/train", function(req, res) {
	let train = req.query.train;
	trainStations = train.split(",");
	res.send(o[trainKey]);
});
app.get("/api/weather", function(req, res) {
	let city = req.query.city;
	location = city;
	res.send(o[weatherKey]);
});

app.use(express.static(path.join(__dirname + "/site")));

// bus     : http://localhost:8080/api/bus?bus=6700,6627,307,332,4640,14487,6347,206
// train   : http://localhost:8080/api/train?train=40350
// weather : http://localhost:8080/api/weather?city=chicago
// all     : http://localhost:8080/api/all?bus=6700,6627,307,332,4640,14487,6347,206&train=40350&city=chicago
