const { DateTime } = require("luxon");
const express = require("express");
const axios = require("axios");
const xml = require("xml");
const { buildSchema } = require("graphql");
const router = express.Router();
const { graphqlHTTP } =  require("express-graphql");

const schema = buildSchema(`
  type Query {
    getWeather(city: String!, date: String!): Weather!
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

const root = {
  getWeather: async ({ city, date }) => {
    console.log("GRAPHQL: ",city, date)
    const timespanPosibleValues = [
      { name: "manhana", offset: 1, days: 1 },
      { name: "7dias", offset: 0, days: 7 },
      { name: "hoy", offset: 0, days: 1 },
    ];
    const nombre = city;
    const timespan = date;
    const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;

    const timesSpanConfig = timespanPosibleValues.find(
      (value) => value.name === timespan
    );
    console.log(timesSpanConfig);
    try {
      const locationResponse = await axios.get(locationURL);
      const locations = locationResponse.data.sort((a, b) =>
        a.importance <= b.importance ? -1 : 1
      );

      if (locations.length === 0) throw new Error("Not found");

      const [resultLocation] = locations.slice(-1);
      // console.log(timesSpanConfig);

      const currentDate = DateTime.now();
      const startDate = currentDate
        .plus({ days: timesSpanConfig.offset })
        .toFormat("yyyy-MM-dd");
      const endDate = currentDate
        .plus({ days: timesSpanConfig.offset + timesSpanConfig.days - 1 })
        .toFormat("yyyy-MM-dd");

      const forecastURL = `https://api.open-meteo.com/v1/forecast?start_date=${startDate}&end_date=${endDate}&latitude=${resultLocation.lat}&longitude=${resultLocation.lon}&daily=temperature_2m_min,temperature_2m_max&timezone=PST`;

      // console.log(forecastURL);

      const forecastResponse = await axios.get(forecastURL);

      // console.log(forecastResponse.data);

      if (false && req.MIMEType === "text/xml") {
        const foreCastXML = [
          { minTempUnit: forecastResponse.data.daily_units.temperature_2m_min },
          { maxTempUnit: forecastResponse.data.daily_units.temperature_2m_max },
          {
            data: [{ hola: "adios" }, { si: "no" }],
            data: forecastResponse.data.daily["time"].map((time, index) => {
              return {
                Forecast: [
                  { time },
                  {
                    minTemp:
                      forecastResponse.data.daily["temperature_2m_min"][index],
                  },
                  {
                    maxTemp:
                      forecastResponse.data.daily["temperature_2m_max"][index],
                  },
                ],
              };
            }),
          },
        ];
        return xml(foreCastXML, { declaration: { encoding: "UTF-8" } });
      } else {
        const foreCastJSON = {
          minTempUnit: forecastResponse.data.daily_units.temperature_2m_min,
          maxTempUnit: forecastResponse.data.daily_units.temperature_2m_max,
          data: forecastResponse.data.daily["time"].map((time, index) => {
            return {
              time,
              minTemp: forecastResponse.data.daily["temperature_2m_min"][index],
              maxTemp: forecastResponse.data.daily["temperature_2m_max"][index],
            };
          }),
        };

        return foreCastJSON;
      }
    } catch (error) {
      console.log(error);
      if (error.message === "Not found")
        return {
          message: `Información de la ciudad ${nombre} no disponible`,
        };
      else return { message: "Servidor no disponible" };
    }
  }
}

router.use('/graphql', graphqlHTTP({
  schema: schema,
  rootValue: root,
  graphiql: true,
}));

const getMIMETypes = (req, res, next) => {
  const acceptedMIMEType = req.accepts(["application/json", "text/xml"]);

  if (!acceptedMIMEType) {
    res.status(406).send({ message: `No se acepta ${req.headers.accept}` });
    return;
  }

  req.MIMEType = acceptedMIMEType;

  next();
};

router.get(
  "/ciudad/:nombre/restaurantes",
  getMIMETypes,
  async function (req, res) {
    const nombre = req.params.nombre;
    const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;

    const restaurantsURL = "https://api.openstreetmap.org/api/0.6/map";

    try {
      const locationResponse = await axios.get(locationURL);
      const locations = locationResponse.data.sort((a, b) =>
        a.importance <= b.importance ? -1 : 1
      );

      if (locations.length === 0) throw new Error("Not found");
      const [resultLocation] = locations.slice(-1);

      // const [minLatitude, maxLatitude, minLongitude, maxLongitude] =
      //   resultLocation.boundingbox;
      const bbox = [
        resultLocation.lon,
        resultLocation.lat,
        (parseFloat(resultLocation.lon) + 0.02).toString(),
        (parseFloat(resultLocation.lat) + 0.02).toString(),
      ];

      const streetLocationsResponse = await axios.get(
        restaurantsURL + `?bbox=${bbox.join(",")}`
      );

      const streetLocationsResult = streetLocationsResponse.data;

      const restaurants = streetLocationsResult.elements
        .filter((element) => {
          if (element.hasOwnProperty("tags")) {
            const tags = element.tags;
            return (
              tags.hasOwnProperty("amenity") &&
              tags.amenity === "restaurant" &&
              tags.hasOwnProperty("addr:street") &&
              tags.hasOwnProperty("addr:housenumber") &&
              tags.hasOwnProperty("name")
            );
          }

          return false;
        })
        .map((element) => {
          const extraAtributes = {
            ...element.tags,
          };

          return {
            nombre: element.tags.name,
            direccion: `${element.tags["addr:street"]} ${element.tags["addr:housenumber"]}`,
          };
        })
        .slice(0, 3);

      if (restaurants.length === 0) throw new Error("No restaurants found");

      console.log(req.MIMEType);
      if (req.MIMEType === "text/xml") {
        res.set("Content-Type", "text/xml");
        res.send(
          xml(
            restaurants.map(({ nombre, direccion }) => {
              return { Restaurante: [{ nombre }, { direccion }] };
            }),
            { declaration: { encoding: "UTF-8" }, indent: "\t" }
          )
        );
      } else res.json(restaurants);
    } catch (error) {
      console.log(error);
      if (error.message === "No restaurants found")
        res.status(404).send({ message: "No hay restaurantes en la ciudad" });
      else if (error.message === "Not found")
        res
          .status(404)
          .send({ message: "No se tiene información de la ciudad" });
      else res.status(503).send({ message: "Servidor no disponible" });
    }
  }
);

router.get(
  "/ciudad/:nombre/clima/:timespan",
  getMIMETypes,
  async (req, res) => {
    const timespanPosibleValues = [
      { name: "manhana", offset: 1, days: 1 },
      { name: "7dias", offset: 0, days: 7 },
      { name: "hoy", offset: 0, days: 1 },
    ];
    const nombre = req.params.nombre;
    const timespan = req.params.timespan;
    const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;

    const timesSpanConfig = timespanPosibleValues.find(
      (value) => value.name === timespan
    );

    if (!timesSpanConfig) {
      res.status(400).send({
        message: `Timespan no es válido (${timespan}), posibles opciones: ${timespanPosibleValues.join(
          ", "
        )}`,
      });
      return;
    }

    try {
      const locationResponse = await axios.get(locationURL);
      const locations = locationResponse.data.sort((a, b) =>
        a.importance <= b.importance ? -1 : 1
      );

      if (locations.length === 0) throw new Error("Not found");

      const [resultLocation] = locations.slice(-1);
      // console.log(timesSpanConfig);

      const currentDate = DateTime.now();
      const startDate = currentDate
        .plus({ days: timesSpanConfig.offset })
        .toFormat("yyyy-MM-dd");
      const endDate = currentDate
        .plus({ days: timesSpanConfig.offset + timesSpanConfig.days - 1 })
        .toFormat("yyyy-MM-dd");

      const forecastURL = `https://api.open-meteo.com/v1/forecast?start_date=${startDate}&end_date=${endDate}&latitude=${resultLocation.lat}&longitude=${resultLocation.lon}&daily=temperature_2m_min,temperature_2m_max&timezone=PST`;

      // console.log(forecastURL);

      const forecastResponse = await axios.get(forecastURL);

      // console.log(forecastResponse.data);

      if (req.MIMEType === "text/xml") {
        const foreCastXML = [
          { minTempUnit: forecastResponse.data.daily_units.temperature_2m_min },
          { maxTempUnit: forecastResponse.data.daily_units.temperature_2m_max },
          {
            data: [{ hola: "adios" }, { si: "no" }],
            data: forecastResponse.data.daily["time"].map((time, index) => {
              return {
                Forecast: [
                  { time },
                  {
                    minTemp:
                      forecastResponse.data.daily["temperature_2m_min"][index],
                  },
                  {
                    maxTemp:
                      forecastResponse.data.daily["temperature_2m_max"][index],
                  },
                ],
              };
            }),
          },
        ];
        res.set("Content-Type", "text/xml");
        res.send(xml(foreCastXML, { declaration: { encoding: "UTF-8" } }));
      } else {
        const foreCastJSON = {
          minTempUnit: forecastResponse.data.daily_units.temperature_2m_min,
          maxTempUnit: forecastResponse.data.daily_units.temperature_2m_max,
          data: forecastResponse.data.daily["time"].map((time, index) => {
            return {
              time,
              minTemp: forecastResponse.data.daily["temperature_2m_min"][index],
              maxTemp: forecastResponse.data.daily["temperature_2m_max"][index],
            };
          }),
        };

        res.json(foreCastJSON);
      }
    } catch (error) {
      console.log(error);
      if (error.message === "Not found")
        res.status(404).send({
          message: `Información de la ciudad ${nombre} no disponible`,
        });
      else res.status(503).send({ message: "Servidor no disponible" });
    }
  }
);

module.exports = router;
