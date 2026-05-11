// Use a function to initialize everything safely
async function startApp() {
    console.log("🚀 Starting Andhra Pradesh Health Dashboard...");

    if (typeof d3 === 'undefined') {
        console.error("❌ D3.js is not loaded! Please check your internet connection or the script tag in index.html.");
        alert("Error: D3.js library failed to load. Please check your internet connection.");
        return;
    }

    const container = document.getElementById("map-container");
    if (!container) {
        console.error("❌ Could not find #map-container");
        return;
    }

    let width = container.clientWidth || window.innerWidth;
    let height = container.clientHeight || window.innerHeight;
    
    console.log(`📏 Map Dimensions: ${width}x${height}`);

    const svg = d3.select("#map")
        .attr("viewBox", [0, 0, width, height]);

    const g = svg.append("g");
    const heatmapLayer = svg.append("g").attr("class", "heatmap-layer");
    const hospitalLayer = svg.append("g").attr("class", "hospital-layer");
    const casesLayer = svg.append("g").attr("class", "cases-layer");

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);

    const tooltip = d3.select("#tooltip");
    const colorScale = d3.scaleSequential(d3.interpolateRgb("#10b981", "#ef4444")); // Emerald to Rose

    let geoData;
    let csvDataGlobal = [];
    let hospitalDataGlobal = [];
    let symptomDataset = [];
    let symptomWeights = {}; 
    let currentAggregatedData = {};
    let currentPopulationData = {};
    let hospitalsPerDistrict = {};
    let focusedDistrict = null;
    let previousYearSelection = "all";
    let currentForecastMode = null;

    let chatState = { step: 'idle', disease: null, days: null, severity: null };

    function initLocatorMap() {
        console.log("📍 Initializing Dashboard Locator Map...");
        const locatorMap = L.map('locator-map', { 
            scrollWheelZoom: false,
            zoomControl: false 
        }).setView([15.9, 79.7], 6);
        L.control.zoom({ position: 'bottomleft' }).addTo(locatorMap);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri'
        }).addTo(locatorMap);

        let markers = [];
        let userMarker = null;

        const hospitalIcon = L.divIcon({
            className: 'custom-hospital-icon',
            html: `
                <div style="background: #ef4444; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 6px rgba(0,0,0,0.1); border: 2px solid white;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                </div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });

        const userLocationIcon = L.divIcon({
            className: 'user-location-icon',
            html: `
                <div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="#3b82f6" stroke="white" stroke-width="2">
                        <path d="M12 21.5c-4.5-4.5-7-8.5-7-11.5a7 7 0 1 1 14 0c0 3-2.5 7-7 11.5z"/>
                        <circle cx="12" cy="10" r="3" fill="white"/>
                    </svg>
                </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32]
        });

        function fetchHospitals(lat, lon) {
            console.log("🏥 Fetching hospitals around:", lat, lon);
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
            // remove old markers
            markers.forEach(m => locatorMap.removeLayer(m));
            markers = [];

            data.elements.forEach(place => {
                let marker = L.marker([place.lat, place.lon], { icon: hospitalIcon })
                  .addTo(locatorMap)
                  .bindPopup(`<b>${place.tags.name || "Health Center"}</b><br>Type: ${place.tags.amenity || place.tags.healthcare || "Clinical"}`);
                markers.push(marker);
            });
        }

        locatorMap.on('click', function(e) {
            let lat = e.latlng.lat;
            let lon = e.latlng.lng;
            console.log("Clicked:", lat, lon);
            fetchHospitals(lat, lon);
        });

        // Geolocation Logic
        function findUserNearby() {
            if (navigator.geolocation) {
                console.log("📍 Triggering manual nearby search...");
                navigator.geolocation.getCurrentPosition(pos => {
                    let lat = pos.coords.latitude;
                    let lon = pos.coords.longitude;
                    locatorMap.setView([lat, lon], 12);
                    
                    if (userMarker) locatorMap.removeLayer(userMarker);
                    userMarker = L.marker([lat, lon], { icon: userLocationIcon }).addTo(locatorMap).bindPopup("<b>Your Location</b>");
                    
                    fetchHospitals(lat, lon);
                }, () => console.log("Geolocation denied."));
            }
        }

        d3.select("#trigger-nearby").on("click", findUserNearby);

        // Home Sidebar Toggle
        const toggleHomeSidebar = () => {
            const sidebar = d3.select(".home-sidebar");
            const isClosed = sidebar.classed("closed");
            sidebar.classed("closed", !isClosed);
            setTimeout(() => dashboardLocatorMap.invalidateSize(), 450);
        };

        d3.select("#toggle-home-sidebar").on("click", toggleHomeSidebar);
        d3.select("#open-home-sidebar").on("click", toggleHomeSidebar);

        // Initial Geolocation
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                let lat = pos.coords.latitude;
                let lon = pos.coords.longitude;
                locatorMap.setView([lat, lon], 12);
                
                if (userMarker) locatorMap.removeLayer(userMarker);
                userMarker = L.marker([lat, lon], { icon: userLocationIcon }).addTo(locatorMap).bindPopup("<b>Your Location</b>");
                
                fetchHospitals(lat, lon);
            }, () => {
                console.log("Geolocation permission denied. Showing default AP view.");
                // Default fallback markers
                const defaultHospitals = [
                    { name: "Apollo Health City", coords: [17.4165, 78.4116], city: "Visakhapatnam" },
                    { name: "Care Hospitals", coords: [17.7231, 83.3013], city: "Visakhapatnam" }
                ];
                defaultHospitals.forEach(h => {
                    L.marker(h.coords, {icon: hospitalIcon}).addTo(locatorMap).bindPopup(`<b>${h.name}</b><br>${h.city}`);
                });
            });
        }

        // Trigger invalidateSize after a small delay to ensure the map renders correctly in the flex container
        setTimeout(() => locatorMap.invalidateSize(), 500);
        return locatorMap;
    }

    const dashboardLocatorMap = initLocatorMap();

    const treatmentKnowledge = {
        "Malaria": { meds: { morning: "Chloroquine Tablet (500mg)", afternoon: "Paracetamol (650mg)", night: "Chloroquine Tablet (500mg)" }, timing: { morning: "After Breakfast", afternoon: "After Lunch", night: "After Dinner" } },
        "Dengue": { meds: { morning: "Paracetamol (650mg)", afternoon: "Vitamin C Supplement", night: "Paracetamol (650mg)" }, timing: { morning: "After Breakfast", afternoon: "After Lunch", night: "After Dinner" } },
        "Fungal infection": { meds: { morning: "Fluconazole Tablet (150mg)", afternoon: "Antifungal Cream Application", night: "Cetirizine Tablet (10mg)" }, timing: { morning: "After Breakfast", afternoon: "Mid-day", night: "Before Sleep" } },
        "Typhoid": { meds: { morning: "Ciprofloxacin Tablet (500mg)", afternoon: "ORS Solution", night: "Ciprofloxacin Tablet (500mg)" }, timing: { morning: "After Breakfast", afternoon: "Frequently", night: "After Dinner" } },
        "Common Cold": { meds: { morning: "Phenylephrine Tablet", afternoon: "Cough Syrup (10ml)", night: "Diphenhydramine" }, timing: { morning: "After Food", afternoon: "After Food", night: "Before Sleep" } },
        "default": { meds: { morning: "General Antimicrobial", afternoon: "Multivitamin Tablet", night: "Pain Reliever" }, timing: { morning: "After Breakfast", afternoon: "After Lunch", night: "After Dinner" } }
    };

    const nameMapping = {
        "Alluri Sitarama Raju": "Alluri Sitharama Raju",
        "Anantapur": "Anantapuramu",
        "Dr. B.R. Ambedkar Konaseema": "Konaseema",
        "SPSR Nellore": "Sri Potti Sriramulu Nellore",
        "YSR Kadapa": "YSR"
    };

    const zoom = d3.zoom()
        .scaleExtent([1, 40])
        .on("zoom", (event) => {
            g.attr("transform", event.transform);
            hospitalLayer.attr("transform", event.transform);
            heatmapLayer.attr("transform", event.transform);
            casesLayer.attr("transform", event.transform);
        });

    svg.call(zoom);

    function getForecastParams() {
        const selectedMetric = d3.select("#metric-select").node().value;
        const yearlyTotals = d3.rollup(csvDataGlobal, v => d3.sum(v, d => +d[selectedMetric]), d => d.Year);
        const sortedYears = Array.from(yearlyTotals.keys()).sort();
        let growthRate = 0.05;
        if (sortedYears.length >= 2) {
            const lastYearVal = yearlyTotals.get(sortedYears[sortedYears.length - 1]);
            const prevYearVal = yearlyTotals.get(sortedYears[sortedYears.length - 2]);
            growthRate = (lastYearVal - prevYearVal) / prevYearVal;
        }
        const lastYearData = csvDataGlobal.filter(d => d.Year === sortedYears[sortedYears.length-1]);
        const districtLatestYear = d3.rollup(lastYearData, v => d3.sum(v, d => +d[selectedMetric]), d => d.District);
        const stateTotalLastYear = d3.sum(Array.from(districtLatestYear.values()));
        const monthlyStateTotals = d3.rollup(csvDataGlobal, v => d3.sum(v, d => +d[selectedMetric]), d => d.Month);
        const avgMonthlyState = d3.sum(Array.from(monthlyStateTotals.values())) / (sortedYears.length * 12);
        return { growthRate, districtLatestYear, stateTotalLastYear, monthlyStateTotals, avgMonthlyState, selectedMetric };
    }

    async function processAndDisplayData() {
        const selectedYear = d3.select("#year-select").node().value;
        const selectedMetric = d3.select("#metric-select").node().value;
        const metricLabel = d3.select("#metric-select option:checked").text();
        const diseaseName = d3.select("#disease-select option:checked").text();
        
        // Add a "calculating" pulse effect to the map
        g.transition().duration(200).style("opacity", 0.5).transition().duration(500).style("opacity", 1);

        let yearLabel = selectedYear === "all" ? "2024-2025" : (selectedYear.startsWith("forecast") ? "2026 Forecast" : selectedYear);
        
        let forecastLabel = "Next 7 Days";
        if (currentForecastMode) {
            if (currentForecastMode.startsWith("month-")) {
                const m = currentForecastMode.split("-")[1];
                const fullMonths = { "Jan":"January", "Feb":"February", "Mar":"March", "Apr":"April", "May":"May", "Jun":"June", "Jul":"July", "Aug":"August", "Sep":"September", "Oct":"October", "Nov":"November", "Dec":"December" };
                forecastLabel = `${fullMonths[m] || m} 2026`;
            } else if (currentForecastMode.startsWith("week-")) {
                forecastLabel = `Week ${currentForecastMode.split("-")[1]} of 2026`;
            }
        }

        const subtitle = selectedYear.startsWith("forecast") ? `2026 AI Prediction (${forecastLabel}) - ${diseaseName}` : `District Intensity Mapping (${yearLabel}) - ${diseaseName}`;
        d3.select("#mapping-subtitle").text(subtitle);
        
        let label = metricLabel;
        if (selectedYear.startsWith("forecast")) label = `Predicted ${metricLabel} (${forecastLabel})`;
        d3.select("#legend-title").text(label);

        const aggregatedData = {};
        const populationData = {};
        if (geoData) geoData.features.forEach(f => { 
            const name = f.properties.district || f.properties.name; 
            aggregatedData[name] = 0; 
            populationData[name] = 0;
        });
        
        if (selectedYear.startsWith("forecast")) {
            const { growthRate, districtLatestYear, monthlyStateTotals, avgMonthlyState } = getForecastParams();
            geoData.features.forEach(f => {
                let name = f.properties.district || f.properties.name;
                let csvName = name; for(let k in nameMapping) if(nameMapping[k] === name) csvName = k;
                const lastYearTotal = districtLatestYear.get(csvName) || 10;
                
                // Also get population for forecast
                const districtRow = csvDataGlobal.find(d => d.District === csvName);
                if (districtRow) populationData[name] = parseInt(districtRow.Population) || 0;

                const monthlyAvg = lastYearTotal / 12;
                let val = 0;
                if (currentForecastMode === "7day") val = (monthlyAvg * (1 + growthRate)) / 4;
                else if (currentForecastMode && currentForecastMode.startsWith("week")) { const weekNum = parseInt(currentForecastMode.split("-")[1]); val = (monthlyAvg * (1 + growthRate) / 4) * (1 + (weekNum * 0.02)); }
                else if (currentForecastMode && currentForecastMode.startsWith("month")) { const mName = currentForecastMode.split("-")[1]; const mTotal = monthlyStateTotals.get(mName) || avgMonthlyState; const factor = mTotal / avgMonthlyState || 1; val = (monthlyAvg * (1 + growthRate)) * factor; }
                else val = (monthlyAvg * (1 + growthRate)) / 4;
                aggregatedData[name] = Math.round(val);
            });
        } else {
            csvDataGlobal.forEach(d => { 
                if (selectedYear === "all" || d.Year === selectedYear) { 
                    let dist = d.District; 
                    if (nameMapping[dist]) dist = nameMapping[dist]; 
                    const value = parseInt(d[selectedMetric]) || 0; 
                    if (aggregatedData[dist] !== undefined) {
                        aggregatedData[dist] += value;
                        // For population, we can take the value from any row for that district (assuming it doesn't change much)
                        populationData[dist] = parseInt(d.Population) || 0;
                    }
                } 
            });
        }
        
        currentAggregatedData = aggregatedData;
        currentPopulationData = populationData;
        const values = Object.values(aggregatedData);
        const min = d3.min(values) || 0; const max = d3.max(values) || 1;
        
        // Use a smoother transition for colors
        colorScale.domain([min, max]);
        d3.select("#min-cases-label").text(min.toLocaleString()); d3.select("#max-cases-label").text(max.toLocaleString());
        
        g.selectAll(".district")
            .transition()
            .duration(800)
            .ease(d3.easeCubicInOut)
            .style("fill", d => {
                const val = currentAggregatedData[d.properties.district || d.properties.name] || 0;
                return colorScale(val);
            });

        if (d3.select("#show-heatmap").property("checked")) {
            updateEpidemiologyHeatmap();
        }
    }

    function updateEpidemiologyHeatmap() {
        if (!geoData) return;
        
        heatmapLayer.selectAll("*").remove();
        casesLayer.selectAll("*").remove();

        const districtCentroids = geoData.features.map(f => {
            const name = f.properties.district || f.properties.name;
            const cases = currentAggregatedData[name] || 0;
            const pop = currentPopulationData[name] || 1;
            return {
                name,
                centroid: path.centroid(f),
                cases,
                population: pop,
                intensity: (cases / pop) * 100000 // Cases per 100k
            };
        });

        const maxIntensity = d3.max(districtCentroids, d => d.intensity) || 1;
        const minIntensity = d3.min(districtCentroids, d => d.intensity) || 0;
        const maxCases = d3.max(districtCentroids, d => d.cases) || 1;

        // Update heatmap legend labels
        d3.select("#min-rate-label").text(Math.round(minIntensity).toLocaleString());
        d3.select("#max-rate-label").text(Math.round(maxIntensity).toLocaleString());

        // Add blurred heat circles
        heatmapLayer.selectAll(".heat-circle")
            .data(districtCentroids)
            .enter()
            .append("circle")
            .attr("class", "heat-circle")
            .attr("cx", d => d.centroid[0])
            .attr("cy", d => d.centroid[1])
            .attr("r", d => 10 + (d.cases / maxCases) * 40)
            .style("fill", d => d3.interpolateRgb("yellow", "blue")(d.intensity / maxIntensity))
            .style("filter", "blur(15px)")
            .style("opacity", 0.4);

        // Add small core markers for better definition
        casesLayer.selectAll(".case-core")
            .data(districtCentroids)
            .enter()
            .append("circle")
            .attr("class", "case-core")
            .attr("cx", d => d.centroid[0])
            .attr("cy", d => d.centroid[1])
            .attr("r", 4)
            .style("fill", d => d3.interpolateRgb("yellow", "blue")(d.intensity / maxIntensity))
            .style("stroke", "#fff")
            .style("stroke-width", "1px")
            .on("mouseover", function(event, d) {
                tooltip.style("opacity", 1).html(`
                    <div style="font-weight: 700; color: var(--accent-color); margin-bottom: 4px;">${d.name}</div>
                    <div style="font-size: 0.75rem;">Total Cases: ${d.cases.toLocaleString()}</div>
                    <div style="font-size: 0.75rem;">Population: ${d.population.toLocaleString()}</div>
                    <div style="font-size: 0.75rem; font-weight: 600; margin-top: 4px;">Rate: ${d.intensity.toFixed(2)} per 100k</div>
                `).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));
    }

    async function loadDiseaseData(file) { 
        try { 
            csvDataGlobal = await d3.csv(file); 
            console.log(`✅ CSV Data Loaded: ${file}`, csvDataGlobal.length, "rows");
            await processAndDisplayData(); 
            generateForecast();
        } catch (e) { 
            console.error(`❌ Error loading CSV (${file}):`, e); 
        } 
    }

    async function loadHospitalData() {
        try {
            hospitalDataGlobal = await d3.csv("data/raw/hospitals.csv");
            hospitalsPerDistrict = {};
            hospitalDataGlobal.forEach(h => { let dist = h.District; if (nameMapping[dist]) dist = nameMapping[dist]; hospitalsPerDistrict[dist] = (hospitalsPerDistrict[dist] || 0) + 1; });
            hospitalLayer.selectAll(".hospital-marker").data(hospitalDataGlobal).enter().append("circle").attr("class", "hospital-marker").attr("cx", d => projection([+d.Longitude, +d.Latitude])[0]).attr("cy", d => projection([+d.Longitude, +d.Latitude])[1]).attr("r", 1.2).style("opacity", 0)
                .on("mouseover", function(event, d) { tooltip.style("opacity", 1).html(`<div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px;">${d.Hospital_Name}</div><div style="font-size: 0.75rem; color: var(--text-secondary);">${d.District}</div>`).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px"); })
                .on("mousemove", (event) => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px"))
                .on("mouseout", () => tooltip.style("opacity", 0));
        } catch (e) { console.error("❌ Error loading hospital data:", e); }
    }

    async function loadSymptomDataset() {
        try {
            const data = await d3.csv("data/raw/dataset.csv");
            const diseaseMap = new Map();
            const globalSymptomCounts = {};
            data.forEach(row => {
                const disease = row.Disease.trim();
                if (!diseaseMap.has(disease)) diseaseMap.set(disease, new Set());
                Object.keys(row).forEach(key => { if (key.startsWith("Symptom") && row[key]) { const symptom = row[key].trim().toLowerCase().replace(/_/g, " "); if (symptom) { diseaseMap.get(disease).add(symptom); globalSymptomCounts[symptom] = (globalSymptomCounts[symptom] || 0) + 1; } } });
            });
            const totalRecords = data.length;
            for (let s in globalSymptomCounts) symptomWeights[s] = Math.log(totalRecords / (globalSymptomCounts[s] + 1)) + 1;
            symptomDataset = Array.from(diseaseMap.entries()).map(([disease, symptoms]) => ({ disease, symptoms: Array.from(symptoms) }));
            console.log("✅ AI Symptom Model Ready");
        } catch (e) { console.error("❌ Error loading symptom dataset:", e); }
    }

    function handleDblClick(event, d) { if (event) event.stopPropagation(); const name = d.properties.district || d.properties.name; if (focusedDistrict === name) resetView(); else focusOnDistrict(event, d, name); }
    function focusOnDistrict(event, d, name) {
        focusedDistrict = name; g.selectAll(".district").transition().duration(500).style("opacity", f => (f.properties.district || f.properties.name) === name ? 1 : 0).style("pointer-events", f => (f.properties.district || f.properties.name) === name ? "auto" : "none");
        const checked = d3.select("#show-hospitals").property("checked"); hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", h => { let dist = h.District; if (nameMapping[dist]) dist = nameMapping[dist]; return (dist === name && checked) ? 1 : 0; });
        const [[x0, y0], [x1, y1]] = path.bounds(d); svg.transition().duration(1000).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(Math.min(15, 0.9 / Math.max((x1-x0)/width, (y1-y0)/height))).translate(-(x0+x1)/2, -(y0+y1)/2));
    }
    function resetView() { focusedDistrict = null; g.selectAll(".district").transition().duration(500).style("opacity", 1).style("pointer-events", "auto"); const checked = d3.select("#show-hospitals").property("checked"); hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", h => checked ? 1 : 0); svg.transition().duration(1000).call(zoom.transform, d3.zoomIdentity); }

    try {
        geoData = await d3.json("data/raw/districts_geo.json");
        console.log("✅ GeoJSON Map Data Loaded:", geoData.features.length, "districts");
        const padding = 40; projection.fitExtent([[padding, padding], [width - padding, height - padding]], geoData);
        g.selectAll("path").data(geoData.features).enter().append("path").attr("class", "district").attr("d", path).style("fill", "#10b981")
            .on("dblclick", handleDblClick)
            .on("mouseover", function(event, d) {
                const name = d.properties.district || d.properties.name || "Unknown";
                const val = currentAggregatedData[name] || 0;
                const yearVal = d3.select("#year-select").node().value; const metricLabel = d3.select("#metric-select option:checked").text();
                d3.select(this).style("stroke-width", "2.5px").style("stroke", "#475569");
                tooltip.style("opacity", 1).html(`<div style="font-weight: 700; color: var(--accent-color); margin-bottom: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">${name}</div><div style="display: flex; justify-content: space-between; gap: 20px;"><span style="color: var(--text-secondary);">${yearVal.startsWith('forecast') ? 'Predicted ' : ''}${metricLabel}:</span><span style="font-weight: 600;">${val.toLocaleString()}</span></div>`).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mousemove", (event) => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px"))
            .on("mouseout", function() { d3.select(this).style("stroke-width", "0.75px").style("stroke", "#475569"); tooltip.style("opacity", 0); });
        
        await loadHospitalData();
        await loadSymptomDataset();
        const initial = d3.select("#disease-select").node().value; 
        await loadDiseaseData(initial);

        d3.select("#disease-select").on("change", function() { loadDiseaseData(this.value); });
        d3.select("#year-select").on("change", function() { if (!this.value.startsWith("forecast")) { previousYearSelection = this.value; currentForecastMode = null; } processAndDisplayData(); });
        d3.select("#metric-select").on("change", () => processAndDisplayData());
        d3.select("#show-hospitals").on("change", function() {
            const checked = d3.select(this).property("checked");
            if (focusedDistrict) hospitalLayer.selectAll(".hospital-marker").transition().duration(300).style("opacity", h => { let dist = h.District; if (nameMapping[dist]) dist = nameMapping[dist]; return (dist === focusedDistrict && checked) ? 1 : 0; });
            else hospitalLayer.selectAll(".hospital-marker").transition().duration(300).style("opacity", checked ? 1 : 0);
        });

        d3.select("#show-heatmap").on("change", function() {
            const checked = d3.select(this).property("checked");
            if (checked) {
                updateEpidemiologyHeatmap();
                heatmapLayer.transition().duration(300).style("opacity", 0.6);
                casesLayer.transition().duration(300).style("opacity", 1);
                d3.select("#heatmap-legend").style("display", "block").transition().duration(300).style("opacity", 1);
            } else {
                heatmapLayer.transition().duration(300).style("opacity", 0);
                casesLayer.transition().duration(300).style("opacity", 0);
                d3.select("#heatmap-legend").transition().duration(300).style("opacity", 0).on("end", function() { d3.select(this).style("display", "none"); });
            }
        });
        d3.select("#zoom-in").on("click", () => svg.transition().call(zoom.scaleBy, 2));
        d3.select("#zoom-out").on("click", () => svg.transition().call(zoom.scaleBy, 0.5));
        d3.select("#reset-zoom").on("click", () => resetView());
        svg.on("click", (event) => { if (event.target.tagName === "svg") resetView(); });
    } catch (e) { console.error("❌ Critical Initialization Error:", e); }

    d3.selectAll(".intel-btn").on("click", function() {
        const target = d3.select(this).attr("data-target");
        const isActive = d3.select(this).classed("active");
        
        d3.selectAll(".intel-btn").classed("active", false);
        d3.selectAll(".sidebar-section").classed("active", false);
        
        if (isActive) {
            document.body.classList.remove("sidebar-open");
        } else {
            d3.select(this).classed("active", true);
            d3.select(`#section-${target}`).classed("active", true);
            document.body.classList.add("sidebar-open");
            if (target === "analytics") loadPredictiveData();
        }
        setTimeout(() => window.dispatchEvent(new Event('resize')), 450);
    });

    d3.selectAll(".nav-btn").on("click", function() {
        const text = d3.select(this).text().toLowerCase();
        d3.selectAll(".nav-btn").classed("active", false);
        d3.select(this).classed("active", true);
        
        d3.selectAll(".view-section").classed("active", false);
        if (text === "home") {
            d3.select("#home-page").classed("active", true);
            document.body.classList.remove("sidebar-open");
            if (dashboardLocatorMap) setTimeout(() => dashboardLocatorMap.invalidateSize(), 100);
        } else if (text === "about") {
            d3.select("#about-page").classed("active", true);
            document.body.classList.remove("sidebar-open");
        } else {
            d3.select("#dashboard-page").classed("active", true);
            setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
        }
    });

    d3.select("#go-to-dashboard").on("click", () => {
        d3.selectAll(".nav-btn").classed("active", false);
        d3.selectAll(".nav-btn").filter(function() { return d3.select(this).text() === "Dashboard"; }).classed("active", true);
        d3.selectAll(".view-section").classed("active", false);
        d3.select("#dashboard-page").classed("active", true);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    });

    window.goToDashboardModule = function(moduleName) {
        // Switch to Dashboard View
        d3.selectAll(".nav-btn").classed("active", false);
        d3.selectAll(".nav-btn").filter(function() { return d3.select(this).text() === "Dashboard"; }).classed("active", true);
        d3.selectAll(".view-section").classed("active", false);
        d3.select("#dashboard-page").classed("active", true);
        
        // Open the specific sidebar module
        d3.selectAll(".intel-btn").classed("active", false);
        d3.selectAll(".sidebar-section").classed("active", false);
        
        const btn = d3.select(`.intel-btn[data-target="${moduleName}"]`);
        btn.classed("active", true);
        d3.select(`#section-${moduleName}`).classed("active", true);
        document.body.classList.add("sidebar-open");
        
        if (moduleName === "analytics") loadPredictiveData();
        
        // Trigger resize for map
        setTimeout(() => window.dispatchEvent(new Event('resize')), 100);
    };

    d3.select("#toggle-sidebar").on("click", function() {
        document.body.classList.toggle("sidebar-open");
        setTimeout(() => window.dispatchEvent(new Event('resize')), 450);
    });

    const chatMessages = d3.select("#chat-messages");
    const chatInput = d3.select("#chat-input"); 
    const sendBtn = d3.select("#send-chat");
    function addMessage(text, sender) { const msg = chatMessages.append("div").attr("class", `message ${sender}`).html(text); chatMessages.node().scrollTop = chatMessages.node().scrollHeight; return msg; }

    async function processChat() {
        const text = chatInput.node().value.trim(); if (!text) return;
        addMessage(text, "user"); chatInput.node().value = "";
        
        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text })
            });
            
            if (!response.ok) {
                if (response.status === 404) {
                    addMessage("The AI Chat requires a Python backend which is not available on this static deployment (GitHub Pages). Please run the project locally to use this feature.", "bot");
                } else {
                    addMessage("Sorry, I'm having trouble connecting to my AI core right now.", "bot");
                }
                return;
            }
            
            const result = await response.json();
            
            // 1. Handle Map/Disease Switches
            if (result.target_disease) {
                const targetFile = result.target_disease === "Malaria" ? "data/raw/malaria.csv" : "data/raw/dengue.csv";
                const currentFile = d3.select("#disease-select").node().value;
                if (currentFile !== targetFile) {
                    addMessage(`Switching map data to <strong>${result.target_disease}</strong>...`, "bot");
                    d3.select("#disease-select").node().value = targetFile;
                    await loadDiseaseData(targetFile);
                }
            }

            // 2. Handle District Isolation & Data Queries
            if (result.district) {
                const targetDistrictKey = nameMapping[result.district] || result.district;
                const feature = geoData.features.find(f => (f.properties.district || f.properties.name) === targetDistrictKey);
                
                if (result.intent === "hospital") {
                    const count = hospitalsPerDistrict[targetDistrictKey] || 0;
                    addMessage(`There are <strong>${count}</strong> registered hospitals in <strong>${result.district}</strong>. I've highlighted them on the map.`, "bot");
                    if (feature) focusOnDistrict(null, feature, targetDistrictKey);
                    d3.select("#show-hospitals").property("checked", true).dispatch("change");
                } else if (text.includes("how many") || text.includes("cases") || text.includes("number") || result.metric !== "Total_Cases") {
                    let totalVal = 0;
                    const selectedYear = d3.select("#year-select").node().value;
                    const diseaseName = d3.select("#disease-select option:checked").text();
                    
                    csvDataGlobal.forEach(d => {
                        let dDist = d.District; if (nameMapping[dDist]) dDist = nameMapping[dDist];
                        if (dDist === targetDistrictKey && (selectedYear === "all" || d.Year === selectedYear)) {
                            totalVal += parseInt(d[result.metric]) || 0;
                        }
                    });

                    const period = selectedYear === "all" ? "the 2024-2025 period" : (selectedYear.startsWith("forecast") ? "the 2026 forecast" : `the year ${selectedYear}`);
                    const metricName = result.metric.replace(/_/g, ' ');
                    addMessage(`In <strong>${result.district}</strong>, the number of <strong>${metricName}</strong> for ${diseaseName} during ${period} is <strong>${totalVal.toLocaleString()}</strong>.`, "bot");
                    if (feature) focusOnDistrict(null, feature, targetDistrictKey);
                } else {
                    addMessage(`I've isolated <strong>${result.district}</strong> for you on the map.`, "bot");
                    if (feature) focusOnDistrict(null, feature, targetDistrictKey);
                }
                return;
            }

            // 3. Handle Diagnosis (New diagnosis takes priority over current workflow)
            if (result.disease && result.confidence > 0.35) {
                chatState.disease = result.disease; 
                chatState.step = 'awaiting_days';
                addMessage(`Based on your symptoms, the AI predicts you may be suffering from <strong>${result.disease}</strong>. How many days have you been experiencing these symptoms?`, "bot");
                return;
            }

            // 4. Handle Symptom Workflow (Multi-turn state managed here)
            if (chatState.step === 'awaiting_days') { 
                chatState.days = text; 
                chatState.step = 'awaiting_severity'; 
                addMessage(`I see. And what is the severity of your symptoms? (Low, Medium, or High)`, "bot"); 
                return; 
            }
            if (chatState.step === 'awaiting_severity') {
                chatState.severity = text;
                const disease = chatState.disease;
                const info = result.treatment || treatmentKnowledge[disease] || treatmentKnowledge["default"];
                let responseHtml = `<div style="margin-bottom:12px;"><strong style="color:var(--accent-color);">Personalized Care Plan for ${disease}</strong></div>`;
                responseHtml += `<div style="margin-bottom:8px;"><strong>Diagnostic Tests:</strong><br/>• Full Blood Count<br/>• Antigen Screening</div>`;
                responseHtml += `<div style="margin-bottom:8px;"><strong>Medication Schedule:</strong><br/><div style="margin-left:8px; border-left:2px solid #38bdf8; padding-left:8px; margin-top:4px;">• <strong>Morning:</strong> ${info.meds.morning}<br/><span style="font-size:0.8rem; color:var(--accent-color);">(${info.timing.morning})</span><br/>• <strong>Afternoon:</strong> ${info.meds.afternoon}<br/><span style="font-size:0.8rem; color:var(--accent-color);">(${info.timing.afternoon})</span><br/>• <strong>Night:</strong> ${info.meds.night}<br/><span style="font-size:0.8rem; color:var(--accent-color);">(${info.timing.night})</span></div></div>`;
                responseHtml += `<div style="margin-bottom:8px;"><strong>Diet Plan:</strong><br/>• High fluid intake<br/>• Light protein rich food</div>`;
                addMessage(responseHtml, "bot");
                chatState = { step: 'idle', disease: null, days: null, severity: null }; 
                return;
            }

            // 5. Handle Low Confidence
            if (result.disease && result.confidence > 0) {
                addMessage(`I found some matches for <strong>${result.disease}</strong>, but I'm not very certain (confidence: ${Math.round(result.confidence * 100)}%). Could you please provide more details about your symptoms?`, "bot");
                return;
            }

            // 6. Display Insights & Default Message
            if (result.insights && result.insights.length > 0) {
                result.insights.forEach(insight => addMessage(insight, "bot"));
                return;
            }

            addMessage(result.message || "I'm here to help! Ask about cases, hospitals, or describe your symptoms.", "bot");
        } catch (error) {
            console.error("Chat API Error:", error);
            addMessage("Sorry, I'm having trouble connecting to my AI core right now.", "bot");
        }
    }
    sendBtn.on("click", processChat); chatInput.on("keypress", (e) => { if (e.key === "Enter") processChat(); });

    function generateForecast() {
        const container = d3.select("#forecast-data"); 
        container.html("");
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const { growthRate, stateTotalLastYear, monthlyStateTotals, avgMonthlyState } = getForecastParams();
        const stateMonthlyAvg = stateTotalLastYear / 12;
        const diseaseName = d3.select("#disease-select option:checked").text();
        
        const peakMonths = monthNames.map(m => {
            const mTotal = monthlyStateTotals.get(m) || avgMonthlyState;
            const factor = mTotal / avgMonthlyState || 1;
            return { name: m, score: (stateMonthlyAvg * (1 + growthRate)) * factor };
        }).sort((a,b) => b.score - a.score).slice(0, 5);

        // --- Insight Card ---
        const insightCard = container.append("div").attr("class", "insight-card animate-in");
        insightCard.html(`
            <div class="insight-header">
                <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>
                AI HEALTH INSIGHT
            </div>
            <div class="insight-content">
                Based on current trends, <strong>${diseaseName}</strong> is projected to see ${growthRate > 0 ? 'an increase' : 'a shift'} in cases over the coming months.
            </div>
            <div class="peak-months">
                <div class="peak-label">Top 5 Peak Months Predicted:</div>
                <div class="peak-tags-container"></div>
            </div>
        `);

        insightCard.select(".peak-tags-container").selectAll(".peak-tag")
            .data(peakMonths).enter().append("span").attr("class", "peak-tag")
            .style("cursor", "pointer")
            .text(d => d.name)
            .on("click", (event, d) => toggleMapForecast(`month-${d.name}`));

        const today = new Date(); const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tom = new Date(today); tom.setDate(today.getDate()+1); const nxt = new Date(today); nxt.setDate(today.getDate()+7);
        
        // --- 7 Day Outlook ---
        container.append("div").attr("class", "forecast-header-sub").text("7-Day Outlook");
        const next7Val = Math.round((stateMonthlyAvg * (1 + growthRate)) / 4);
        const item7 = container.append("div").attr("class", "forecast-item");
        item7.html(`
            <div class="forecast-item-header"><span class="forecast-year">${fmt(tom)} - ${fmt(nxt)}</span><span class="forecast-value">${next7Val.toLocaleString()} est. cases</span></div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                <div class="forecast-trend ${growthRate > 0 ? '' : 'down'}">~ ${Math.round(next7Val/7)} cases/day</div>
                <button class="map-toggle-btn ${currentForecastMode === '7day' ? 'active' : ''}">${currentForecastMode === '7day' ? 'Disable on Map' : 'Show on Map'}</button>
            </div>
        `);
        item7.select(".map-toggle-btn").on("click", () => toggleMapForecast('7day'));

        // --- Weekly Forecast ---
        container.append("div").attr("class", "forecast-header-sub").text("1-Month Forecast (Weekly)");
        for (let i = 1; i <= 4; i++) {
            const mode = `week-${i}`;
            const weekVal = Math.round(((stateMonthlyAvg * (1 + growthRate)) / 4) * (1 + i * 0.02));
            const wItem = container.append("div").attr("class", "forecast-item");
            wItem.html(`
                <div class="forecast-item-header"><span class="forecast-year">Week ${i}</span><span class="forecast-value">${weekVal.toLocaleString()} cases</span></div>
                <div style="display: flex; justify-content: flex-end; margin-top: 6px;">
                    <button class="map-toggle-btn ${currentForecastMode === mode ? 'active' : ''}">${currentForecastMode === mode ? 'Disable on Map' : 'Show on Map'}</button>
                </div>
            `);
            wItem.select(".map-toggle-btn").on("click", () => toggleMapForecast(mode));
        }

        // --- Monthly Projection ---
        container.append("div").attr("class", "forecast-header-sub").text("12-Month Projection");
        const monthGrid = container.append("div").style("display", "grid").style("grid-template-columns", "1fr 1fr").style("gap", "8px");
        for (let i = 0; i < 12; i++) {
            const mName = monthNames[i]; const mode = `month-${mName}`;
            const mTotal = monthlyStateTotals.get(mName) || avgMonthlyState;
            const factor = mTotal / avgMonthlyState || 1;
            const mVal = Math.round((stateMonthlyAvg * (1 + growthRate)) * factor);
            const mItem = monthGrid.append("div").attr("class", "forecast-item compact");
            mItem.html(`
                <div class="forecast-item-header"><span class="forecast-year">${mName}</span><span class="forecast-value">${mVal.toLocaleString()}</span></div>
                <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                    <button class="map-toggle-btn ${currentForecastMode === mode ? 'active' : ''}" style="font-size: 0.55rem; padding: 2px 4px;">${currentForecastMode === mode ? 'Disable on Map' : 'Show on Map'}</button>
                </div>
            `);
            mItem.select(".map-toggle-btn").on("click", () => toggleMapForecast(mode));
        }
        
        const now = new Date(); 
        d3.select("#last-refreshed").text(`Refreshed on ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}`);
    }

    function toggleMapForecast(mode) {
        const select = d3.select("#year-select");
        if (currentForecastMode === mode) { 
            select.node().value = previousYearSelection; 
            currentForecastMode = null; 
        } else { 
            if (!select.node().value.startsWith("forecast")) previousYearSelection = select.node().value; 
            select.node().value = "forecast"; 
            currentForecastMode = mode; 
        }
        processAndDisplayData();
    }

    d3.select("#refresh-forecast").on("click", function() { 
        const btn = d3.select(this); 
        btn.style("transform", "rotate(360deg)"); 
        setTimeout(() => { 
            btn.style("transform", "rotate(0deg)"); 
            generateForecast(); 
        }, 500); 
    });

    async function loadPredictiveData() {
        try {
            const response = await fetch('/api/predictive');
            if (!response.ok) return;
            const data = await response.json();
            
            // 1. Update Heatmap & Cases
            renderHeatmap(data.cases);
            
            // 2. Update Risk Gauge
            const riskRate = data.summary.readmission_rate * 100;
            d3.select("#risk-gauge-fill").style("width", `${riskRate}%`);
            d3.select("#risk-value").text(`${riskRate.toFixed(1)}%`);
            
            // 3. Update Feature Importance
            const fiContainer = d3.select("#feature-importance").html("");
            Object.entries(data.metrics.feature_importance)
                .sort((a, b) => b[1] - a[1])
                .forEach(([feature, importance]) => {
                    const row = fiContainer.append("div").style("margin-bottom", "8px");
                    row.html(`
                        <div style="display: flex; justify-content: space-between; font-size: 0.7rem; margin-bottom: 2px;">
                            <span>${feature}</span>
                            <span>${(importance * 100).toFixed(0)}%</span>
                        </div>
                        <div style="height: 6px; width: 100%; background: #e2e8f0; border-radius: 3px;">
                            <div style="height: 100%; width: ${importance * 100}%; background: var(--accent-color); border-radius: 3px;"></div>
                        </div>
                    `);
                });
            
            // 4. Update Model Performance
            d3.select("#auc-score").text(data.metrics.auc.toFixed(3));
            const cm = data.metrics.confusion_matrix;
            d3.select("#cm-00").text(cm[0][0]);
            d3.select("#cm-01").text(cm[0][1]);
            d3.select("#cm-10").text(cm[1][0]);
            d3.select("#cm-11").text(cm[1][1]);

        } catch (e) { console.error("❌ Error loading predictive data:", e); }
    }

    function renderHeatmap(cases) {
        // Clear existing
        heatmapLayer.selectAll("*").remove();
        casesLayer.selectAll("*").remove();
        
        // Heatmap: Circles with blur effect
        heatmapLayer.selectAll(".heat-point").data(cases).enter()
            .append("circle")
            .attr("cx", d => projection([+d.Longitude, +d.Latitude])[0])
            .attr("cy", d => projection([+d.Longitude, +d.Latitude])[1])
            .attr("r", 15)
            .style("fill", "var(--accent-color)")
            .style("filter", "blur(10px)")
            .style("opacity", 0.3);

        // Case markers: Smaller, interactive
        casesLayer.selectAll(".case-marker").data(cases).enter()
            .append("circle")
            .attr("class", "case-marker")
            .attr("cx", d => projection([+d.Longitude, +d.Latitude])[0])
            .attr("cy", d => projection([+d.Longitude, +d.Latitude])[1])
            .attr("r", 3)
            .style("fill", d => d.Readmission ? "#ef4444" : "#3b82f6")
            .style("stroke", "#fff")
            .style("stroke-width", "1px")
            .on("mouseover", function(event, d) {
                tooltip.style("opacity", 1).html(`
                    <div style="font-weight: 700; color: ${d.Readmission ? '#ef4444' : '#3b82f6'}; margin-bottom: 4px;">Patient #${d.Patient_ID}</div>
                    <div style="font-size: 0.75rem;">Age: ${d.Age} | Disease: ${d.Disease}</div>
                    <div style="font-size: 0.75rem;">Symptoms: ${d.Symptoms}</div>
                    <div style="font-size: 0.75rem; margin-top: 4px; font-weight: 600;">Readmission Risk: ${d.Readmission ? 'HIGH' : 'LOW'}</div>
                `).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
            })
            .on("mouseout", () => tooltip.style("opacity", 0));

        heatmapLayer.style("opacity", d3.select("#show-heatmap").property("checked") ? 0.6 : 0);
        casesLayer.style("opacity", d3.select("#show-heatmap").property("checked") ? 1 : 0);
    }

    window.addEventListener('resize', () => { 
        width = container.clientWidth; height = container.clientHeight; 
        svg.attr("viewBox", [0, 0, width, height]); 
        projection.fitSize([width, height], geoData); 
        g.selectAll("path").attr("d", path); 
        hospitalLayer.selectAll(".hospital-marker").attr("cx", d => projection([+d.Longitude, +d.Latitude])[0]).attr("cy", d => projection([+d.Longitude, +d.Latitude])[1]); 
        heatmapLayer.selectAll("circle").attr("cx", d => projection([+d.Longitude, +d.Latitude])[0]).attr("cy", d => projection([+d.Longitude, +d.Latitude])[1]);
        casesLayer.selectAll("circle").attr("cx", d => projection([+d.Longitude, +d.Latitude])[0]).attr("cy", d => projection([+d.Longitude, +d.Latitude])[1]);
    });
}

// Start the application when the DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp);
} else {
    startApp();
}
