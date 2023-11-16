const { DateTime } = require("luxon");
const express = require("express");
const axios = require("axios");
const xml = require("xml");
const router = express.Router();

//create unleash client and set up authentication
const { initialize } = require("unleash-client");

const unleash = initialize({
  appName: "nueva_api",
  url: "http://localhost:4242/api/",
  customHeaders: {
    Authorization:
      "*:development.e6226b882629fbb7da13105cb5c765477737554781a53411fa5a47fc",
  },
});

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

    const restaurantsURL = "https://api.openstreetmap.org/api/0.6/map";

    //get email from url query params
    const email = req.query.email;

    const isEnabled = email
      ? unleash.isEnabled("nueva_api", { userId: email })
      : unleash.isEnabled("nueva_api");

    if (email) console.log(`Email: ${email}`);
    else console.log("No email provided");

    try {
      let longitude;
      let latitude;

      if (isEnabled) {
        console.log("Using new api");
        const locationURL = `https://geocoding-api.open-meteo.com/v1/search?name=${nombre}`;
        const locationResponse = await axios.get(locationURL);
        const [resultLocation] = locationResponse.data.results;

        latitude = resultLocation.latitude;
        longitude = resultLocation.longitude;
      } else {
        console.log("Using old api");
        const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;
        const locationResponse = await axios.get(locationURL);
        const locations = locationResponse.data.sort((a, b) =>
          a.importance <= b.importance ? -1 : 1
        );

        if (locations.length === 0) throw new Error("Not found");
        const [resultLocation] = locations.slice(-1);

        latitude = resultLocation.lat;
        longitude = resultLocation.lon;
      }

      const bbox = [
        longitude,
        latitude,
        (parseFloat(longitude) + 0.02).toString(),
        (parseFloat(latitude) + 0.02).toString(),
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
    const email = req.query.email;

    const isEnabled = email
      ? unleash.isEnabled("nueva_api", { userId: email })
      : unleash.isEnabled("nueva_api");

    if (email) console.log(`Email: ${email}`);
    else console.log("No email provided");
    const timespanPosibleValues = [
      { name: "manhana", offset: 1, days: 1 },
      { name: "7dias", offset: 0, days: 7 },
      { name: "hoy", offset: 0, days: 1 },
    ];
    const nombre = req.params.nombre;
    const timespan = req.params.timespan;

    const timesSpanConfig = timespanPosibleValues.find(
      (value) => value.name === timespan
    );
    const currentDate = DateTime.now();
    let startDate;
    let endDate;

    if (!timesSpanConfig) {
      const parsedDate = DateTime.fromFormat(timespan, "yyyy-MM-dd");
      if (!parsedDate.isValid) {
        res.status(400).send({
          message: `Timespan no es válido (${timespan}), posibles opciones: ${timespanPosibleValues.join(
            ", "
          )}`,
        });
      }

      startDate = parsedDate.toFormat("yyyy-MM-dd");
      endDate = parsedDate.toFormat("yyyy-MM-dd");
    } else {
      startDate = currentDate
        .plus({ days: timesSpanConfig.offset })
        .toFormat("yyyy-MM-dd");
      endDate = currentDate
        .plus({ days: timesSpanConfig.offset + timesSpanConfig.days - 1 })
        .toFormat("yyyy-MM-dd");
    }

    try {
      let longitude;
      let latitude;

      if (isEnabled) {
        console.log("Using new api");
        const locationURL = `https://geocoding-api.open-meteo.com/v1/search?name=${nombre}`;
        const locationResponse = await axios.get(locationURL);
        const [resultLocation] = locationResponse.data.results;

        latitude = resultLocation.latitude;
        longitude = resultLocation.longitude;
      } else {
        console.log("Using old api");
        const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;
        const locationResponse = await axios.get(locationURL);
        const locations = locationResponse.data.sort((a, b) =>
          a.importance <= b.importance ? -1 : 1
        );

        if (locations.length === 0) throw new Error("Not found");
        const [resultLocation] = locations.slice(-1);

        latitude = resultLocation.lat;
        longitude = resultLocation.lon;
      }

      const forecastURL = `https://api.open-meteo.com/v1/forecast?start_date=${startDate}&end_date=${endDate}&latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_min,temperature_2m_max&timezone=PST`;

      const forecastResponse = await axios.get(forecastURL);

      if (req.MIMEType === "text/xml") {
        const foreCastXML = [
          { minTempUnit: forecastResponse.data.daily_units.temperature_2m_min },
          { maxTempUnit: forecastResponse.data.daily_units.temperature_2m_max },
          { longitude },
          { latitude },
          {
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
          latitude,
          longitude,
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
