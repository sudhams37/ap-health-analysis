document.addEventListener('DOMContentLoaded', () => {
    // Create map centered on Andhra Pradesh
    var map = L.map('map').setView([15.9, 79.7], 6);

    // Add ESRI tiles
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
      { attribution: '© Esri' }
    ).addTo(map);

    var markers = [];
    var hospitalIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/2967/2967350.png',
      iconSize: [30, 30],
      iconAnchor: [15, 30]
    });

    function fetchHospitals(lat, lon) {
        console.log("🏥 Overpass API: Fetching hospitals...");
        let query = `
        [out:json];
        (
          node["amenity"="hospital"](around:5000, ${lat}, ${lon});
          node["healthcare"="centre"](around:5000, ${lat}, ${lon});
          node["amenity"="clinic"](around:5000, ${lat}, ${lon});
        );
        out;
        `;
        let url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
        fetch(url)
          .then(res => res.json())
          .then(data => showHospitals(data));
    }

    function showHospitals(data) {
        markers.forEach(m => map.removeLayer(m));
        markers = [];
        data.elements.forEach(place => {
            let marker = L.marker([place.lat, place.lon], { icon: hospitalIcon })
              .addTo(map)
              .bindPopup(`<b>${place.tags.name || "Health Center"}</b>`);
            markers.push(marker);
        });
    }

    map.on('click', function(e) {
        fetchHospitals(e.latlng.lat, e.latlng.lng);
    });

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            let lat = pos.coords.latitude;
            let lon = pos.coords.longitude;
            map.setView([lat, lon], 12);
            fetchHospitals(lat, lon);
        });
    }
});
