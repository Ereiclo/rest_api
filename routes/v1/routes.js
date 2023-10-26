const express = require("express");
const axios = require("axios");
const router = express.Router();

router.get("/ciudad/:nombre/restaurantes", async function (req, res) {
  const nombre = req.params.nombre;
  const locationURL = `https://nominatim.openstreetmap.org/search?q=${nombre}&format=json`;

  const restaurantsURL = "https://api.openstreetmap.org/api/0.6/map";

  try {
    const locationResponse = await axios.get(locationURL);
    const locations = locationResponse.data.sort((a, b) =>
      a.importance <= b.importance ? -1 : 1
    );
    const [resultLocation] = locations.slice(-1);

    const [minLatitude, maxLatitude, minLongitude, maxLongitude] =
      resultLocation.boundingbox;
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
      });

    const acceptedMIMEType = req.accepts(["application/json", "application/xml"]);

    console.log(acceptedMIMEType);

    res.json(restaurants);
  } catch (error) {
    console.log(error);
    res.status(404).send({ message: "Error con la ciudad" });
  }

});

module.exports = router;
