import express from "express";
import { graphqlHTTP } from "express-graphql";
import { buildSchema } from "graphql";
import axios from "axios";

//Images data

// GraphQL Schema
const schema = buildSchema(`
      type Query {
        getRestaurants(ciudad: String): [Restaurant]
        getWeather(city: String!, date: String!): Weather
      }
      type Restaurant {
        nombre: String
        direccion: String
      }    
      type Weather {
        city: String!
        temperatureMax: Float!
        temperatureMin: Float!
        lat: Float!
        lon: Float!
        date: String!
      }
`);

// Get single Image using id

async function getRestaurants({ ciudad }) {
  const restaurants = await axios.get(
    `http://localhost:8080/api/v1/ciudad/${ciudad}/restaurantes`
  );

  return restaurants.data;
}

async function getWeather({ city, date }) {
  const weather = await axios.get(
    `http://localhost:8080/api/v1/ciudad/${city}/clima/${date}`
  );

  const forecast = weather.data;
  const { time, minTemp, maxTemp } = forecast.data[0];

  console.log(forecast);
  return {
    date: time,
    city,
    temperatureMax: maxTemp,
    temperatureMin: minTemp,
    lat: parseFloat(forecast.latitude),
    lon: parseFloat(forecast.longitude),
  };
}

//Get images using category

function getImages(args) {
  if (args.category) {
    return imagesData.filter(
      (image) => image.category.toLowerCase() === args.category.toLowerCase()
    );
  } else {
    return imagesData;
  }
}

// Resolver
const root = {
  getRestaurants, // images: getImages,
  getWeather,
};

//Create an express server and GraphQL endpoint
const app = express();
app.use(
  "/graphql",
  graphqlHTTP({
    schema: schema,
    rootValue: root,
    graphiql: true,
  })
);

//Listening to our server
app.listen(5000, () => {
  console.log("GraphQL server with Express running on localhost:5000/graphql");
});
