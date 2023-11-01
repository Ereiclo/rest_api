import express from "express";
import { graphqlHTTP } from "express-graphql";
import { buildSchema } from "graphql";
import axios from "axios";

//Images data

// GraphQL Schema
const schema = buildSchema(`
      type Query {
        getRestaurants(ciudad: String): [Restaurant]
      }
      type Restaurant {
        nombre: String
        direccion: String
      }
`);

// Get single Image using id

async function getRestaurants(args) {
  const restaurants = await axios.get(
    `http://localhost:3000/api/v1/ciudad/${args.ciudad}/restaurantes`
  );

  return restaurants.data;
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
