document.addEventListener('DOMContentLoaded', () => {
    console.log("📍 Initializing AP Health Locator...");

    const map = L.map('map', { 
        zoomControl: false,
        scrollWheelZoom: false 
    }).setView([15.9, 79.7], 6);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    }).addTo(map);

    let markers = [];
    let userMarker = null;
    let searchType = 'hospital';
    let currentData = [];

    const hospitalIcon = L.divIcon({
        className: 'custom-hospital-icon',
        html: `<div style="background: #ef4444; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid white;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
               </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const userLocationIcon = L.divIcon({
        className: 'user-location-icon',
        html: `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="2">
                    <path d="M12 21.5c-4.5-4.5-7-8.5-7-11.5a7 7 0 1 1 14 0c0 3-2.5 7-7 11.5z"/>
                    <circle cx="12" cy="10" r="3" fill="white"/>
                </svg>
               </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 32]
    });

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    async function searchNearby() {
        const district = document.getElementById("loc-district").value.trim();
        const mandal = document.getElementById("loc-mandal").value.trim();
        const village = document.getElementById("loc-village").value.trim();
        const distance = parseInt(document.getElementById("loc-distance").value) || 25;
        const tableBody = document.getElementById("table-body");
        const resultsCount = document.getElementById("results-count");
        const tableTitle = document.getElementById("table-title");
        const thName = document.getElementById("th-name");
        const modal = document.getElementById("locator-modal");

        if (!district || !village) {
            alert(`Please enter a District and Village to locate ${searchType === 'hospital' ? 'hospitals' : (searchType === 'blood' ? 'blood banks' : (searchType === 'pharmacy' ? 'pharmacies' : 'ambulance stations'))}.`);
            return;
        }

        const typeLabel = searchType === 'hospital' ? 'hospitals' : (searchType === 'blood' ? 'blood banks' : (searchType === 'pharmacy' ? 'pharmacies' : 'health care centers'));
        resultsCount.textContent = `Searching ${typeLabel} grid...`;
        tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);">Initializing hyper-local ${searchType} scan...</td></tr>`;
        
        // Hide modal when search starts
        modal.classList.add("hidden");

        try {
            const address = `${village}, ${mandal}, ${district}, Andhra Pradesh, India`;
            const geoUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
            const geoRes = await fetch(geoUrl, { headers: { "User-Agent": "APHealthLocator/1.0" } });
            const geoData = await geoRes.json();

            if (geoData.length === 0) {
                resultsCount.textContent = "Area not found";
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#ef4444;">Village not found. Check spelling or add Mandal.</td></tr>';
                return;
            }

            const { lat, lon } = geoData[0];
            const center = [parseFloat(lat), parseFloat(lon)];
            map.setView(center, 12);
            if (userMarker) map.removeLayer(userMarker);
            userMarker = L.marker(center, { icon: userLocationIcon }).addTo(map).bindPopup(`<b>Marked Village:</b> ${village}`);

            const radius = distance * 1000;
            let query = '';
            if (searchType === 'hospital') {
                const selectedType = document.getElementById("loc-type").value;
                let hospFilter = 'node["amenity"="hospital"]';
                let centreFilter = 'node["healthcare"="centre"]';
                let clinicFilter = 'node["amenity"="clinic"]';
                let wayFilter = 'way["amenity"="hospital"]';

                if (selectedType === 'hospitals') { centreFilter = ''; clinicFilter = ''; }
                else if (selectedType === 'centers') { hospFilter = ''; clinicFilter = ''; wayFilter = ''; }
                else if (selectedType === 'clinics') { hospFilter = ''; centreFilter = ''; wayFilter = ''; }

                let subQueries = [
                    hospFilter ? `${hospFilter}(around:${radius}, ${lat}, ${lon})` : '',
                    centreFilter ? `${centreFilter}(around:${radius}, ${lat}, ${lon})` : '',
                    clinicFilter ? `${clinicFilter}(around:${radius}, ${lat}, ${lon})` : '',
                    wayFilter ? `${wayFilter}(around:${radius}, ${lat}, ${lon})` : ''
                ].filter(q => q !== '').join(';');

                query = `[out:json];(${subQueries};);out center;`;
            } else if (searchType === 'blood') {
                query = `[out:json];(node["amenity"="blood_bank"](around:${radius}, ${lat}, ${lon});node["healthcare"="blood_bank"](around:${radius}, ${lat}, ${lon});node["amenity"="blood_donation"](around:${radius}, ${lat}, ${lon}););out center;`;
            } else if (searchType === 'pharmacy') {
                query = `[out:json];(node["amenity"="pharmacy"](around:${radius}, ${lat}, ${lon});way["amenity"="pharmacy"](around:${radius}, ${lat}, ${lon});relation["amenity"="pharmacy"](around:${radius}, ${lat}, ${lon});node["healthcare"="pharmacy"](around:${radius}, ${lat}, ${lon});way["healthcare"="pharmacy"](around:${radius}, ${lat}, ${lon});relation["healthcare"="pharmacy"](around:${radius}, ${lat}, ${lon}););out center;`;
            } else {
                const selectedType = document.getElementById("loc-type").value;
                let typeFilter = '';
                if (selectedType === 'PHC') typeFilter = '[name~"PHC|Primary Health",i]';
                else if (selectedType === 'AAM') typeFilter = '[name~"Ayushman|Arogya",i]';
                else if (selectedType === 'UPHC') typeFilter = '[name~"UPHC|Urban Primary",i]';
                else if (selectedType === 'DH') typeFilter = '[name~"District Hospital",i]';
                else if (selectedType === 'CHC') typeFilter = '[name~"CHC|Community Health",i]';
                else if (selectedType === 'TH') typeFilter = '[name~"Teaching|Medical College",i]';

                query = `[out:json];(node["healthcare"="centre"]${typeFilter}(around:${radius}, ${lat}, ${lon});node["amenity"="doctors"]${typeFilter}(around:${radius}, ${lat}, ${lon});node["healthcare"="doctor"]${typeFilter}(around:${radius}, ${lat}, ${lon});node["amenity"="hospital"]${typeFilter}(around:${radius}, ${lat}, ${lon}););out center;`;
            }

            const overpassUrl = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);
            const opRes = await fetch(overpassUrl, { headers: { "User-Agent": "APHealthLocator/1.0" } });
            const opData = await opRes.json();

            markers.forEach(m => map.removeLayer(m));
            markers = [];
            tableBody.innerHTML = "";

            if (opData.elements.length === 0) {
                resultsCount.textContent = `0 ${typeLabel} found`;
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-secondary);">No ${typeLabel} discovered within ${distance}km radius.</td></tr>`;
                return;
            }

            resultsCount.textContent = `Showing ${opData.elements.length} ${typeLabel}`;
            tableTitle.textContent = `${searchType === 'hospital' ? 'Hospital' : (searchType === 'blood' ? 'Blood Bank' : (searchType === 'pharmacy' ? 'Pharmacy' : 'Health Care Center'))} Registry for Selected Area`;
            thName.textContent = `${searchType === 'hospital' ? 'Hospital' : (searchType === 'blood' ? 'Blood Bank' : (searchType === 'pharmacy' ? 'Pharmacy' : 'Health Care Center'))} Name`;

            const sortedElements = opData.elements.map(place => {
                const pLat = place.lat || (place.center && place.center.lat);
                const pLon = place.lon || (place.center && place.center.lon);
                const dist = (pLat && pLon) ? calculateDistance(center[0], center[1], pLat, pLon) : Infinity;
                return { ...place, dist, pLat, pLon };
            }).sort((a, b) => a.dist - b.dist);

            currentData = [];

            sortedElements.forEach(place => {
                const { pLat, pLon, dist } = place;
                if (!pLat || !pLon) return;

                let defaultName = "Regional Health Center";
                if (searchType === 'blood') defaultName = "Central Blood Bank";
                if (searchType === 'pharmacy') defaultName = "Local Medical Store";
                if (searchType === 'healthcare') defaultName = "Health Care Center";

                const name = place.tags.name || defaultName;
                const type = (place.tags.amenity || place.tags.healthcare || "Facility").replace('_', ' ').toUpperCase();
                const distStr = dist.toFixed(2);
                
                currentData.push({
                    name,
                    category: type,
                    distance: distStr,
                    status: 'Active'
                });

                const marker = L.marker([pLat, pLon], { icon: hospitalIcon })
                    .addTo(map)
                    .bindPopup(`<b>${name}</b><br/>${type}`);
                markers.push(marker);

                const row = document.createElement("tr");
                row.innerHTML = `
                    <td class="result-title">${name}</td>
                    <td>${type}</td>
                    <td>${distStr} KM</td>
                    <td><span class="status-badge status-active">Active</span></td>
                    <td><button class="table-action-btn">Focus</button></td>
                `;
                row.onclick = () => {
                    if (window.activeHighlight) map.removeLayer(window.activeHighlight);
                    const highlight = L.circle([pLat, pLon], { radius: 200, color: '#0ea5e9', fillColor: '#0ea5e9', fillOpacity: 0.4, weight: 2, className: 'map-pulse-animation' }).addTo(map);
                    window.activeHighlight = highlight;
                    setTimeout(() => { if (window.activeHighlight === highlight) map.removeLayer(highlight); }, 3000);
                    map.setView([pLat, pLon], 16, { animate: true, duration: 1 });
                    marker.openPopup();
                };
                tableBody.appendChild(row);
            });

            const group = new L.featureGroup([userMarker, ...markers]);
            map.fitBounds(group.getBounds().pad(0.1));

        } catch (e) {
            console.error("Locator error:", e);
            resultsCount.textContent = "Search Failed";
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#ef4444;">Connection failed. Verify API availability.</td></tr>';
        }
    }

    document.getElementById("search-facilities").addEventListener("click", searchNearby);

    const sidebar = document.querySelector(".home-sidebar");
    const toggleBtn = document.getElementById("toggle-home-sidebar");
    
    const toggleFacilitiesBtn = document.getElementById("toggle-facilities");
    const facilitiesMenu = document.getElementById("facilities-menu");
    const toggleIcon = document.getElementById("toggle-icon");
    
    toggleFacilitiesBtn.addEventListener("click", () => {
        const isHidden = facilitiesMenu.style.display === "none";
        facilitiesMenu.style.display = isHidden ? "flex" : "none";
        toggleIcon.textContent = isHidden ? "-" : "+";
    });

    const toggleAnalysisBtn = document.getElementById("toggle-analysis");
    const analysisMenu = document.getElementById("analysis-menu");
    const analysisToggleIcon = document.getElementById("analysis-toggle-icon");
    
    toggleAnalysisBtn.addEventListener("click", () => {
        const isHidden = analysisMenu.style.display === "none";
        facilitiesMenu.style.display = "none"; // Hide facilities menu if opening analysis
        toggleIcon.textContent = "+";
        
        analysisMenu.style.display = isHidden ? "flex" : "none";
        analysisToggleIcon.textContent = isHidden ? "-" : "+";
    });

    toggleBtn.addEventListener("click", () => {
        sidebar.classList.toggle("closed");
        setTimeout(() => map.invalidateSize(), 500);
    });

    const nearbyBtn = document.getElementById("trigger-nearby");
    const bloodBtn = document.getElementById("trigger-blood");
    const modal = document.getElementById("locator-modal");
    const closeModal = document.getElementById("close-modal");
    const modalTitle = document.getElementById("modal-title");
    const searchBtnText = document.getElementById("search-btn-text");

    function updateTypeOptions(type) {
        const select = document.getElementById("loc-type");
        select.innerHTML = '<option value="all">All Types</option>';
        if (type === 'hospital') {
            select.innerHTML += '<option value="hospitals">Hospitals</option><option value="centers">Centers</option><option value="clinics">Clinics</option>';
        } else if (type === 'healthcare') {
            select.innerHTML += '<option value="PHC">Primary Health Centers (PHC)</option><option value="AAM">Ayushman Arogya Mandir (AAM)</option><option value="UPHC">Urban Primary Health Centers (UPHC)</option><option value="DH">District Hospitals</option><option value="CHC">Community Health Centers (CHC)</option><option value="TH">Teaching Hospitals</option>';
        }
    }

    nearbyBtn.addEventListener("click", () => {
        searchType = 'hospital';
        modalTitle.textContent = 'Nearby Hospital Audit';
        searchBtnText.textContent = 'Search Hospitals';
        updateTypeOptions('hospital');
        document.getElementById("loc-type-container").style.display = "block";
        modal.classList.remove("hidden");
    });

    bloodBtn.addEventListener("click", () => {
        searchType = 'blood';
        modalTitle.textContent = 'Nearby Blood Bank Audit';
        searchBtnText.textContent = 'Search Bloodbanks';
        document.getElementById("loc-type-container").style.display = "none";
        modal.classList.remove("hidden");
    });

    const pharmacyBtn = document.getElementById("trigger-pharmacy");
    pharmacyBtn.addEventListener("click", () => {
        searchType = 'pharmacy';
        modalTitle.textContent = 'Nearby Pharmacy Audit';
        searchBtnText.textContent = 'Search Pharmacies';
        document.getElementById("loc-type-container").style.display = "none";
        modal.classList.remove("hidden");
    });

    const healthcareBtn = document.getElementById("trigger-healthcare");
    healthcareBtn.addEventListener("click", () => {
        searchType = 'healthcare';
        modalTitle.textContent = 'Nearby Health Care Center Audit';
        searchBtnText.textContent = 'Search Health Centers';
        updateTypeOptions('healthcare');
        document.getElementById("loc-type-container").style.display = "block";
        modal.classList.remove("hidden");
    });

    closeModal.addEventListener("click", () => {
        modal.classList.add("hidden");
    });

    modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
    });

    const tableViewBtn = document.getElementById("toggle-table-view");
    const viewWrapper = document.querySelector(".map-and-table-wrapper");
    let currentViewState = 'standard';

    tableViewBtn.addEventListener("click", () => {
        if (currentViewState === 'standard') {
            viewWrapper.classList.add("table-maximized");
            currentViewState = 'maximized';
        } else if (currentViewState === 'maximized') {
            viewWrapper.classList.remove("table-maximized");
            viewWrapper.classList.add("table-minimized");
            currentViewState = 'minimized';
        } else {
            viewWrapper.classList.remove("table-minimized");
            currentViewState = 'standard';
        }
        setTimeout(() => map.invalidateSize(), 550);
    });

    const downloadReportBtn = document.getElementById("download-report-btn");
    if (downloadReportBtn) {
        downloadReportBtn.addEventListener("click", () => {
            if (!currentData || currentData.length === 0) {
                alert("No data available to download.");
                return;
            }

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += `${searchType === 'hospital' ? 'Hospital' : (searchType === 'blood' ? 'Blood Bank' : (searchType === 'pharmacy' ? 'Pharmacy' : 'Health Care Center'))} Name,Category,Distance (KM),Status\n`;

            currentData.forEach(row => {
                const escapedName = `"${row.name.replace(/"/g, '""')}"`;
                csvContent += `${escapedName},${row.category},${row.distance},${row.status}\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `${searchType}_report.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    const popBtn = document.getElementById("trigger-population");
    let popLayer = null;
    let popLegend = null;

    async function showPopulationAnalysis() {
        if (popLayer) {
            map.removeLayer(popLayer);
            if (popLegend) popLegend.remove();
            popLayer = null; popLegend = null;
            popBtn.classList.remove("active");
            
            // Restore default table headers
            const thead = document.querySelector("#results-table thead tr");
            thead.innerHTML = `
                <th id="th-name">Hospital Name</th>
                <th>Category</th>
                <th>Distance</th>
                <th>Status</th>
                <th>Action</th>
            `;
            document.getElementById("table-title").textContent = "Hospital Registry for Selected Area";
            document.getElementById("table-body").innerHTML = "";
            return;
        }

        // Clear other layers if active
        if (bedsLayer) showBedsAnalysis();
        if (gapLayer) showGapAnalysis();

        try {
            const geoData = await d3.json("data/raw/andhra.json");
            const popDataRaw = await d3.csv("data/raw/malaria.csv");
            const hospDataRaw = await d3.csv("data/raw/hospitals.csv");
            
            const analysisMap = {};
            const nameMap = {
                "Alluri Sitharama Raju": "Alluri Sitarama Raju",
                "Anantapuramu": "Anantapur",
                "Konaseema": "Dr. B.R. Ambedkar Konaseema",
                "Sri Potti Sriramulu Nellore": "SPSR Nellore",
                "YSR": "YSR Kadapa"
            };

            // Aggregate Population
            popDataRaw.forEach(d => {
                const dist = d.District;
                if (!analysisMap[dist]) {
                    analysisMap[dist] = { population: parseInt(d.Population) || 0, hospitals: 0 };
                }
            });

            // Aggregate Hospital Counts
            hospDataRaw.forEach(d => {
                const dist = d.District;
                if (analysisMap[dist]) analysisMap[dist].hospitals += 1;
            });

            function style(feature) {
                let name = feature.properties.district || feature.properties.name;
                if (nameMap[name]) name = nameMap[name];
                const data = analysisMap[name];
                if (!data) return { fillColor: '#94a3b8', weight: 1.5, opacity: 1, color: 'white', fillOpacity: 0.7 };
                
                const capacity = data.hospitals * 20000;
                const isUnderserved = data.population > capacity;
                
                return {
                    fillColor: isUnderserved ? '#ef4444' : '#22c55e',
                    weight: 1.5,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.7
                };
            }

            popLayer = L.geoJSON(geoData, {
                style: style,
                onEachFeature: (feature, layer) => {
                    let name = feature.properties.district || feature.properties.name;
                    if (nameMap[name]) name = nameMap[name];
                    const data = analysisMap[name];
                    if (data) {
                        const capacity = data.hospitals * 20000;
                        const status = data.population > capacity ? "More Population, Less Service" : "More Service, Less Population";
                        layer.bindTooltip(`<b>${name}</b><br/>Population: ${data.population.toLocaleString()}<br/>Status: ${status}`, { sticky: true });
                    }
                    layer.on('mouseover', function() { this.setStyle({ fillOpacity: 0.9, weight: 3 }); });
                    layer.on('mouseout', function() { this.setStyle({ fillOpacity: 0.7, weight: 1.5 }); });
                }
            }).addTo(map);

            popLegend = L.control({ position: 'bottomright' });
            popLegend.onAdd = function() {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'white';
                div.style.padding = '10px';
                div.style.borderRadius = '8px';
                div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                div.style.fontSize = '0.75rem';
                div.innerHTML = `
                    <b style="display:block; margin-bottom:5px;">Service Level Audit</b>
                    <i style="background:#22c55e; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> Adequate Service<br>
                    <i style="background:#ef4444; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> High Demand / Underserved
                `;
                return div;
            };
            popLegend.addTo(map);
            
            map.fitBounds(popLayer.getBounds());
            popBtn.classList.add("active");

            // Update Table with Analysis Data
            document.getElementById("table-title").textContent = "District-wise Service Level Audit Report";
            const thead = document.querySelector("#results-table thead tr");
            thead.innerHTML = `
                <th>District</th>
                <th>Population</th>
                <th>Hospitals</th>
                <th>Cap (20K Ratio)</th>
                <th>Status</th>
            `;

            const tbody = document.getElementById("table-body");
            tbody.innerHTML = "";
            
            Object.entries(analysisMap).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, data]) => {
                const row = document.createElement("tr");
                const capacity = data.hospitals * 20000;
                const isUnderserved = data.population > capacity;
                const statusColor = isUnderserved ? "#ef4444" : "#22c55e";
                const statusText = isUnderserved ? "More Population" : "More Service";
                
                row.innerHTML = `
                    <td style="font-weight:600;">${name}</td>
                    <td>${data.population.toLocaleString()}</td>
                    <td>${data.hospitals.toLocaleString()}</td>
                    <td>${capacity.toLocaleString()}</td>
                    <td style="color:${statusColor}; font-weight:700;">${statusText}</td>
                `;
                tbody.appendChild(row);
            });
            document.getElementById("results-count").textContent = `Showing ${Object.keys(analysisMap).length} Districts`;

        } catch (e) {
            console.error("Population analysis error:", e);
        }
    }

    // Removal of showHospitalAnalysis logic as requested by removing the UI button
    
    const bedsAnalysisBtn = document.getElementById("trigger-beds-analysis");
    let bedsLayer = null;
    let bedsLegend = null;

    async function showBedsAnalysis() {
        if (bedsLayer) {
            map.removeLayer(bedsLayer);
            if (bedsLegend) bedsLegend.remove();
            bedsLayer = null; bedsLegend = null;
            bedsAnalysisBtn.classList.remove("active");
            return;
        }

        // Clear other layers if active
        if (popLayer) showPopulationAnalysis();
        if (gapLayer) showGapAnalysis();

        try {
            const geoData = await d3.json("data/raw/andhra.json");
            const popDataRaw = await d3.csv("data/raw/malaria.csv");
            
            const bedsRequiredMap = {};
            const nameMap = {
                "Alluri Sitharama Raju": "Alluri Sitarama Raju",
                "Anantapuramu": "Anantapur",
                "Konaseema": "Dr. B.R. Ambedkar Konaseema",
                "Sri Potti Sriramulu Nellore": "SPSR Nellore",
                "YSR": "YSR Kadapa"
            };

            popDataRaw.forEach(d => {
                const dist = d.District;
                const population = parseInt(d.Population) || 0;
                // Equation: (Population / 1000) * 1.3
                const bedsRequired = (population / 1000) * 1.3;
                if (!bedsRequiredMap[dist]) bedsRequiredMap[dist] = Math.round(bedsRequired);
            });

            const values = Object.values(bedsRequiredMap);
            const minVal = d3.min(values);
            const maxVal = d3.max(values);
            
            const colorScale = d3.scaleSequential(d3.interpolatePurples)
                .domain([minVal, maxVal]);

            function style(feature) {
                let name = feature.properties.district || feature.properties.name;
                if (nameMap[name]) name = nameMap[name];
                const beds = bedsRequiredMap[name] || 0;
                return {
                    fillColor: colorScale(beds),
                    weight: 1.5,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.7
                };
            }

            bedsLayer = L.geoJSON(geoData, {
                style: style,
                onEachFeature: (feature, layer) => {
                    let name = feature.properties.district || feature.properties.name;
                    if (nameMap[name]) name = nameMap[name];
                    const beds = bedsRequiredMap[name] || 0;
                    layer.bindTooltip(`<b>${name}</b><br/>Required Beds: ${beds.toLocaleString()}`, { sticky: true });
                    layer.on('mouseover', function() { this.setStyle({ fillOpacity: 0.9, weight: 3 }); });
                    layer.on('mouseout', function() { this.setStyle({ fillOpacity: 0.7, weight: 1.5 }); });
                }
            }).addTo(map);

            bedsLegend = L.control({ position: 'bottomright' });
            bedsLegend.onAdd = function() {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'white';
                div.style.padding = '10px';
                div.style.borderRadius = '8px';
                div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                div.style.fontSize = '0.7rem';
                div.style.lineHeight = '1.5';
                
                const grades = [minVal, Math.round(minVal + (maxVal-minVal)*0.33), Math.round(minVal + (maxVal-minVal)*0.66), maxVal];
                div.innerHTML = '<b style="display:block; margin-bottom:5px;">Beds Requirement</b>';
                for (let i = 0; i < grades.length; i++) {
                    div.innerHTML += '<i style="background:' + colorScale(grades[i]) + '; width:12px; height:12px; display:inline-block; margin-right:5px; vertical-align:middle;"></i> ' + 
                    Math.round(grades[i]/1000).toFixed(1) + 'K' + (grades[i + 1] ? '&ndash;' + Math.round(grades[i + 1]/1000).toFixed(1) + 'K<br>' : '+');
                }
                return div;
            };
            bedsLegend.addTo(map);
            
            map.fitBounds(bedsLayer.getBounds());
            bedsAnalysisBtn.classList.add("active");

        } catch (e) {
            console.error("Beds requirement analysis error:", e);
        }
    }

    bedsAnalysisBtn.addEventListener("click", showBedsAnalysis);

    const gapAnalysisBtn = document.getElementById("trigger-gap-analysis");
    let gapLayer = null;
    let gapLegend = null;

    async function showGapAnalysis() {
        if (gapLayer) {
            map.removeLayer(gapLayer);
            if (gapLegend) gapLegend.remove();
            gapLayer = null; gapLegend = null;
            gapAnalysisBtn.classList.remove("active");
            
            // Restore default table headers
            const thead = document.querySelector("#results-table thead tr");
            thead.innerHTML = `
                <th id="th-name">Hospital Name</th>
                <th>Category</th>
                <th>Distance</th>
                <th>Status</th>
                <th>Action</th>
            `;
            document.getElementById("table-title").textContent = "Hospital Registry for Selected Area";
            document.getElementById("table-body").innerHTML = "";
            return;
        }

        // Clear other layers if active
        if (popLayer) showPopulationAnalysis();
        if (bedsLayer) showBedsAnalysis();

        try {
            const geoData = await d3.json("data/raw/andhra.json");
            const popDataRaw = await d3.csv("data/raw/malaria.csv");
            const hospDataRaw = await d3.csv("data/raw/hospitals.csv");
            
            const districtData = {};
            const nameMap = {
                "Alluri Sitharama Raju": "Alluri Sitarama Raju",
                "Anantapuramu": "Anantapur",
                "Konaseema": "Dr. B.R. Ambedkar Konaseema",
                "Sri Potti Sriramulu Nellore": "SPSR Nellore",
                "YSR": "YSR Kadapa"
            };

            // Calculate Population & Required Beds
            popDataRaw.forEach(d => {
                const dist = d.District;
                const pop = parseInt(d.Population) || 0;
                if (!districtData[dist]) {
                    districtData[dist] = { 
                        population: pop, 
                        required: Math.round((pop / 1000) * 1.3), // Restored to 1.3
                        hospitals: 0 
                    };
                }
            });

            // Calculate Available Hospitals
            hospDataRaw.forEach(d => {
                const dist = d.District;
                if (districtData[dist]) {
                    districtData[dist].hospitals += 1;
                }
            });

            // Calculate Available Beds & Status
            Object.values(districtData).forEach(d => {
                d.available = d.hospitals * 21; // Average changed from 100 to 21
                d.isSufficient = d.available >= d.required;
            });

            function style(feature) {
                let name = feature.properties.district || feature.properties.name;
                if (nameMap[name]) name = nameMap[name];
                const data = districtData[name];
                return {
                    fillColor: data ? (data.isSufficient ? '#22c55e' : '#ef4444') : '#94a3b8',
                    weight: 1.5,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.7
                };
            }

            function style(feature) {
                let name = feature.properties.district || feature.properties.name;
                if (nameMap[name]) name = nameMap[name];
                const data = districtData[name];
                return {
                    fillColor: data ? (data.isSufficient ? '#22c55e' : '#ef4444') : '#94a3b8',
                    weight: 1.5,
                    opacity: 1,
                    color: 'white',
                    fillOpacity: 0.7
                };
            }

            gapLayer = L.geoJSON(geoData, {
                style: style,
                onEachFeature: (feature, layer) => {
                    let name = feature.properties.district || feature.properties.name;
                    if (nameMap[name]) name = nameMap[name];
                    const data = districtData[name];
                    const status = data ? (data.isSufficient ? "Sufficient Capacity" : "Insufficient Capacity") : "No Data";
                    layer.bindTooltip(`<b>${name}</b><br/>Status: ${status}`, { sticky: true });
                    layer.on('mouseover', function() { this.setStyle({ fillOpacity: 0.9, weight: 3 }); });
                    layer.on('mouseout', function() { this.setStyle({ fillOpacity: 0.7, weight: 1.5 }); });
                }
            }).addTo(map);

            gapLegend = L.control({ position: 'bottomright' });
            gapLegend.onAdd = function() {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'white';
                div.style.padding = '10px';
                div.style.borderRadius = '8px';
                div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                div.style.fontSize = '0.75rem';
                div.innerHTML = `
                    <b style="display:block; margin-bottom:5px;">Hospital Sufficiency Audit</b>
                    <i style="background:#22c55e; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> Sufficient<br>
                    <i style="background:#ef4444; width:12px; height:12px; display:inline-block; margin-right:5px;"></i> Insufficient
                `;
                return div;
            };
            gapLegend.addTo(map);
            
            map.fitBounds(gapLayer.getBounds());
            gapAnalysisBtn.classList.add("active");

            // Restore Table Analysis Data
            document.getElementById("table-title").textContent = "District-wise Infrastructure Gap & Requirement Report";
            const thead = document.querySelector("#results-table thead tr");
            thead.innerHTML = `
                <th>District</th>
                <th>Required Beds</th>
                <th>Available Beds</th>
                <th>Balance Needed</th>
                <th>Addl. Hospitals Needed</th>
                <th>Status</th>
            `;

            const tbody = document.getElementById("table-body");
            tbody.innerHTML = "";
            
            Object.entries(districtData).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, data]) => {
                const row = document.createElement("tr");
                const statusColor = data.isSufficient ? "#22c55e" : "#ef4444";
                const statusText = data.isSufficient ? "Sufficient" : "Insufficient";
                
                const balanceNeeded = Math.max(0, data.required - data.available);
                const addlHospitals = Math.ceil(balanceNeeded / 21);
                
                row.innerHTML = `
                    <td style="font-weight:600;">${name}</td>
                    <td>${data.required.toLocaleString()}</td>
                    <td>${data.available.toLocaleString()}</td>
                    <td style="color:${balanceNeeded > 0 ? '#ef4444' : 'inherit'}; font-weight:500;">${balanceNeeded.toLocaleString()}</td>
                    <td style="font-weight:500;">${addlHospitals > 0 ? addlHospitals.toLocaleString() : '0'}</td>
                    <td style="color:${statusColor}; font-weight:700;">${statusText}</td>
                `;
                tbody.appendChild(row);
            });
            document.getElementById("results-count").textContent = `Showing ${Object.keys(districtData).length} Districts`;


        } catch (e) {
            console.error("Gap analysis error:", e);
        }
    }

    gapAnalysisBtn.addEventListener("click", showGapAnalysis);

    popBtn.addEventListener("click", () => {
        if (bedsLayer) showBedsAnalysis();
        if (gapLayer) showGapAnalysis();
        showPopulationAnalysis();
    });

    setTimeout(() => map.invalidateSize(), 500);
});
