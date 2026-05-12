async function startDashboard() {
    console.log("🚀 Starting Health Analytics Dashboard...");

    const container = document.getElementById("map-container");
    if (!container) return;

    let width = container.clientWidth || 800;
    let height = container.clientHeight || 600;

    d3.select("#map").selectAll("*").remove();
    const svg = d3.select("#map").attr("viewBox", [0, 0, width, height]);
    const g = svg.append("g");
    const hotspotLayer = svg.append("g").attr("class", "hotspot-layer");
    const hospitalLayer = svg.append("g").attr("class", "hospital-layer");

    const projection = d3.geoMercator();
    const path = d3.geoPath().projection(projection);
    const tooltip = d3.select("body").append("div").attr("class", "tooltip").style("opacity", 0).style("position", "absolute").style("background", "rgba(255, 255, 255, 0.95)").style("padding", "10px").style("border", "1px solid #e2e8f0").style("border-radius", "8px").style("pointer-events", "none").style("font-size", "12px").style("box-shadow", "0 4px 6px rgba(0,0,0,0.1)").style("z-index", "2000");
    
    const colorScale = d3.scaleLinear()
        .range(["#22c55e", "#facc15", "#ef4444"])
        .interpolate(d3.interpolateHcl);

    const hotspotColorScale = d3.scaleThreshold()
        .domain([0.5, 1.0])
        .range(["#22c55e", "#3b82f6", "#ef4444"]);

    let csvDataGlobal = [];
    let geoData;
    let currentAggregatedData = {};
    let currentPopulationData = {};
    let currentForecastMode = null;
    let previousYearSelection = "all";
    let symptomDataset = [];
    let symptomWeights = {};
    let focusedDistrict = null;
    let chatState = { step: 'idle', disease: null };
    let hospitalsPerDistrict = {};

    const nameMapping = {
        "Alluri Sitarama Raju": "Alluri Sitharama Raju",
        "Anantapur": "Anantapuramu",
        "Dr. B.R. Ambedkar Konaseema": "Konaseema",
        "SPSR Nellore": "Sri Potti Sriramulu Nellore",
        "YSR Kadapa": "YSR"
    };

    const districtList = ["Alluri Sitarama Raju", "Anakapalli", "Anantapur", "Annamayya", "Bapatla", "Chittoor", "Dr. B.R. Ambedkar Konaseema", "East Godavari", "Eluru", "Guntur", "Kakinada", "Konaseema", "Krishna", "Kurnool", "Nandyal", "NTR", "Palnadu", "Parvathipuram Manyam", "Prakasam", "SPSR Nellore", "Sri Potti Sriramulu Nellore", "Sri Sathya Sai", "Srikakulam", "Tirupati", "Visakhapatnam", "Vizianagaram", "West Godavari", "YSR", "YSR Kadapa"];

    const metricMap = {
        "total": "Total_Cases", "confirmed": "Confirmed_Cases", "recovered": "Recovered", 
        "death": "Deaths", "mortality": "Deaths", "active": "Active_Cases", 
        "pf": "Pf_Cases", "pv": "Pv_Cases", "incidence": "Incidence_Rate", 
        "rate": "Incidence_Rate", "death rate": "Death_Rate", "rainfall": "Rainfall", 
        "temperature": "Temperature", "weather": "Temperature", "population": "Population"
    };

    // --- Core Data Logic ---
    function getForecastParams() {
        let selectedMetric = document.getElementById("metric-select").value;
        if (selectedMetric === "Recovered_Cases") selectedMetric = "Recovered";
        if (selectedMetric === "Death_Cases") selectedMetric = "Deaths";
        const yearlyTotals = d3.rollup(csvDataGlobal, v => d3.sum(v, d => +d[selectedMetric]), d => d.Year);
        const sortedYears = Array.from(yearlyTotals.keys()).sort();
        let growthRate = 0.05;
        if (sortedYears.length >= 2) {
            const last = yearlyTotals.get(sortedYears[sortedYears.length - 1]);
            const prev = yearlyTotals.get(sortedYears[sortedYears.length - 2]);
            growthRate = prev > 0 ? (last - prev) / prev : 0.05;
        }
        const lastYearData = csvDataGlobal.filter(d => d.Year === sortedYears[sortedYears.length-1]);
        const districtLatestYear = d3.rollup(lastYearData, v => d3.sum(v, d => +d[selectedMetric]), d => d.District);
        const stateTotalLastYear = d3.sum(Array.from(districtLatestYear.values()));
        const monthlyStateTotals = d3.rollup(csvDataGlobal, v => d3.sum(v, d => +d[selectedMetric]), d => d.Month);
        const avgMonthlyState = (d3.sum(Array.from(monthlyStateTotals.values())) / (sortedYears.length * 12)) || 1;
        return { growthRate, districtLatestYear, stateTotalLastYear, monthlyStateTotals, avgMonthlyState, selectedMetric };
    }

    async function loadDiseaseData(file) {
        try {
            csvDataGlobal = await d3.csv(file);
            currentPopulationData = {};
            csvDataGlobal.forEach(d => {
                let dist = d.District; if (nameMapping[dist]) dist = nameMapping[dist];
                if (!currentPopulationData[dist]) currentPopulationData[dist] = parseInt(d.Population) || 1000000;
            });
            processAndDisplayData();
            generateForecast();
        } catch (e) { console.error("Error loading disease data:", e); }
    }

    function processAndDisplayData() {
        const selectedYear = document.getElementById("year-select").value;
        let selectedMetric = document.getElementById("metric-select").value;
        if (selectedMetric === "Recovered_Cases") selectedMetric = "Recovered";
        if (selectedMetric === "Death_Cases") selectedMetric = "Deaths";
        const aggregatedData = {};
        geoData.features.forEach(f => { const name = f.properties.district || f.properties.name; aggregatedData[name] = 0; });
        const isForecast = selectedYear === "forecast" || currentForecastMode;
        if (isForecast) {
            const { growthRate, districtLatestYear, monthlyStateTotals, avgMonthlyState } = getForecastParams();
            geoData.features.forEach(f => {
                let name = f.properties.district || f.properties.name;
                let csvName = name; for(let k in nameMapping) if(nameMapping[k] === name) csvName = k;
                const lastYearTotal = districtLatestYear.get(csvName) || 10; const monthlyAvg = lastYearTotal / 12;
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
                    let dist = d.District; if (nameMapping[dist]) dist = nameMapping[dist];
                    if (aggregatedData[dist] !== undefined) aggregatedData[dist] += parseInt(d[selectedMetric]) || 0;
                }
            });
        }
        currentAggregatedData = aggregatedData;
        const values = Object.values(aggregatedData); const minVal = d3.min(values) || 0; const maxVal = d3.max(values) || 1;
        colorScale.domain([minVal, (minVal + maxVal) / 2, maxVal]);
        g.selectAll(".district").transition().duration(800).style("fill", d => colorScale(currentAggregatedData[d.properties.district || d.properties.name] || 0));
        if (document.getElementById("hotspot-toggle").checked) updateHotspotMap();
        const metricName = document.getElementById("metric-select").options[document.getElementById("metric-select").selectedIndex].text;
        const statusText = isForecast ? `Predicted ${metricName}` : metricName;
        d3.selectAll(".map-legend:not(.hotspot-legend) .legend-title").text(statusText); 
        d3.selectAll(".map-legend:not(.hotspot-legend) .legend-min").text(minVal.toLocaleString()); 
        d3.selectAll(".map-legend:not(.hotspot-legend) .legend-max").text(maxVal.toLocaleString());
    }

    function toggleMapForecast(mode) {
        const select = document.getElementById("year-select");
        if (currentForecastMode === mode) { select.value = previousYearSelection; currentForecastMode = null; }
        else { if (select.value !== "forecast") previousYearSelection = select.value; select.value = "forecast"; currentForecastMode = mode; }
        processAndDisplayData(); generateForecast();
    }

    function generateForecast() {
        const container = document.getElementById("forecast-data"); if (!container) return; container.innerHTML = "";
        
        // 1. Real-time Clock & Daily Predictor Section
        const clockDiv = document.createElement("div");
        clockDiv.style.marginBottom = "1.5rem";
        clockDiv.style.padding = "1.25rem";
        clockDiv.style.background = "#ffffff";
        clockDiv.style.borderRadius = "16px";
        clockDiv.style.border = "1px solid rgba(14, 165, 233, 0.15)";
        clockDiv.style.boxShadow = "0 10px 15px -3px rgba(14, 165, 233, 0.1)";

        const { growthRate, stateTotalLastYear, monthlyStateTotals, avgMonthlyState } = getForecastParams();
        const stateMonthlyAvg = stateTotalLastYear / 12;
        const todayCasesVal = Math.round((stateMonthlyAvg * (1 + growthRate)) / 30.4);

        const updateClock = () => {
            const now = new Date();
            clockDiv.innerHTML = `
                <div style="font-size: 0.65rem; font-weight: 800; color: var(--accent-color); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Live Surveillance</div>
                <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary);">${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</div>
                <div style="font-size: 1.3rem; font-weight: 900; color: var(--text-primary); font-variant-numeric: tabular-nums; margin-bottom: 12px;">${now.toLocaleTimeString()}</div>
                
                <div style="padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.05);">
                    <div style="font-size: 0.65rem; font-weight: 800; color: var(--text-secondary); text-transform: uppercase;">Today's Predicted Cases</div>
                    <div style="font-size: 1.5rem; font-weight: 900; color: var(--text-primary);">${todayCasesVal.toLocaleString()} <span style="font-size: 0.8rem; font-weight: 600; color: ${growthRate > 0 ? '#ef4444' : '#22c55e'};">${(growthRate > 0 ? '▲ +' : '▼ ') + (growthRate * 100).toFixed(1)}%</span></div>
                </div>
            `;
        };
        updateClock();
        const clockInterval = setInterval(updateClock, 1000);
        // Clean up interval if function runs again
        if (window.activeClock) clearInterval(window.activeClock);
        window.activeClock = clockInterval;
        
        container.appendChild(clockDiv);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const diseaseName = document.getElementById("disease-select").options[document.getElementById("disease-select").selectedIndex].text;

        const peakMonths = monthNames.map(m => { const mTotal = monthlyStateTotals.get(m) || avgMonthlyState; const factor = mTotal / avgMonthlyState || 1; return { name: m, score: (stateMonthlyAvg * (1 + growthRate)) * factor }; }).sort((a,b) => b.score - a.score).slice(0, 5);
        const insight = document.createElement("div"); insight.className = "insight-card";
        insight.innerHTML = `<div class="insight-header"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>AI HEALTH INSIGHT</div><div style="font-size:0.8rem; line-height:1.4; color:var(--text-primary); margin-bottom:1rem;">Based on seasonal patterns, <strong>${diseaseName}</strong> shows a ${growthRate > 0 ? 'rising' : 'shifting'} intensity of <strong>${(Math.abs(growthRate)*100).toFixed(1)}%</strong>.</div><div style="font-size:0.65rem; font-weight:800; color:var(--text-secondary); text-transform:uppercase; margin-bottom:0.5rem;">Predicted Peak Months:</div><div class="peak-tags-container"></div>`;
        const tagsContainer = insight.querySelector(".peak-tags-container"); peakMonths.forEach(pm => { const tag = document.createElement("span"); tag.className = "peak-tag"; tag.textContent = pm.name; tag.onclick = () => toggleMapForecast(`month-${pm.name}`); tagsContainer.appendChild(tag); });
        container.appendChild(insight);
        const today = new Date(); const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const tom = new Date(today); tom.setDate(today.getDate()+1); const nxt = new Date(today); nxt.setDate(today.getDate()+7);
        const h7 = document.createElement("div"); h7.className = "sidebar-group-title"; h7.textContent = "7-Day Outlook"; container.appendChild(h7);
        const next7Val = Math.round((stateMonthlyAvg * (1 + growthRate)) / 4); const item7 = document.createElement("div"); item7.className = "forecast-item";
        item7.innerHTML = `<div class="forecast-item-header"><span>${fmt(tom)} - ${fmt(nxt)}</span><span class="forecast-value">${next7Val.toLocaleString()} cases</span></div><div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;"><div style="font-size:0.7rem; color:${growthRate > 0 ? '#ef4444' : '#22c55e'};">~ ${Math.round(next7Val/7)}/day</div><button class="map-toggle-btn ${currentForecastMode === '7day' ? 'active' : ''}">${currentForecastMode === '7day' ? 'Disable' : 'Show'}</button></div>`;
        item7.querySelector(".map-toggle-btn").onclick = () => toggleMapForecast('7day'); container.appendChild(item7);
        const hw = document.createElement("div"); hw.className = "sidebar-group-title"; hw.style.marginTop = "1.5rem"; hw.textContent = "1-Month Forecast"; container.appendChild(hw);
        for (let i = 1; i <= 4; i++) {
            const mode = `week-${i}`; const weekVal = Math.round(((stateMonthlyAvg * (1 + growthRate)) / 4) * (1 + i * 0.02)); const wItem = document.createElement("div"); wItem.className = "forecast-item"; wItem.style.marginTop = "8px";
            wItem.innerHTML = `<div class="forecast-item-header"><span>Week ${i}</span><span class="forecast-value">${weekVal.toLocaleString()}</span></div><div style="display:flex; justify-content:flex-end; margin-top:6px;"><button class="map-toggle-btn ${currentForecastMode === mode ? 'active' : ''}">${currentForecastMode === mode ? 'Disable' : 'Show'}</button></div>`;
            wItem.querySelector(".map-toggle-btn").onclick = () => toggleMapForecast(mode); container.appendChild(wItem);
        }
        const hm = document.createElement("div"); hm.className = "sidebar-group-title"; hm.style.marginTop = "1.5rem"; hm.textContent = "12-Month Projection"; container.appendChild(hm);
        const monthGrid = document.createElement("div"); monthGrid.style.display = "grid"; monthGrid.style.gridTemplateColumns = "1fr 1fr"; monthGrid.style.gap = "8px";
        monthNames.forEach(mName => {
            const mode = `month-${mName}`; const mTotal = monthlyStateTotals.get(mName) || avgMonthlyState; const factor = mTotal / avgMonthlyState || 1; const mVal = Math.round((stateMonthlyAvg * (1 + growthRate)) * factor); const mItem = document.createElement("div"); mItem.className = "forecast-item";
            mItem.innerHTML = `<div class="forecast-item-header" style="font-size:0.75rem;"><span>${mName}</span><span class="forecast-value">${mVal.toLocaleString()}</span></div><div style="display:flex; justify-content:flex-end; margin-top:4px;"><button class="map-toggle-btn ${currentForecastMode === mode ? 'active' : ''}" style="font-size:0.55rem; padding:2px 6px;">${currentForecastMode === mode ? 'Disable' : 'Show'}</button></div>`;
            mItem.querySelector(".map-toggle-btn").onclick = () => toggleMapForecast(mode); monthGrid.appendChild(mItem);
        });
        container.appendChild(monthGrid);
    }

    function updateHotspotMap() {
        hotspotLayer.selectAll("*").remove(); 
        const isEnabled = document.getElementById("hotspot-toggle").checked;
        const hotspotLegend = d3.select("#hotspot-legend");
        
        if (!isEnabled) { 
            hotspotLegend.style("display", "none"); 
            const summaryCard = document.getElementById("hotspot-summary");
            if (summaryCard) summaryCard.style.display = "none";
            return; 
        }
        
        hotspotLegend.style("display", "block");

        const selectedYear = document.getElementById("year-select").value;
        const districtRates = {};
        geoData.features.forEach(f => { 
            const name = f.properties.district || f.properties.name; 
            districtRates[name] = { incidence: [], death: [] }; 
        });

        csvDataGlobal.forEach(d => {
            if (selectedYear === "all" || d.Year === selectedYear) {
                let dist = d.District; if (nameMapping[dist]) dist = nameMapping[dist];
                if (districtRates[dist]) {
                    if (d.Incidence_Rate) districtRates[dist].incidence.push(+d.Incidence_Rate);
                    if (d.Death_Rate) districtRates[dist].death.push(+d.Death_Rate);
                }
            }
        });

        const centroids = geoData.features.map(f => { 
            const name = f.properties.district || f.properties.name; 
            const cases = currentAggregatedData[name] || 0; 
            const pop = currentPopulationData[name] || 1000000; 
            const rate = (cases / pop) * 100000;
            const avgIncidence = d3.mean(districtRates[name].incidence) || 0;
            const avgDeath = d3.mean(districtRates[name].death) || 0;
            return { name, centroid: path.centroid(f), rate, cases, avgIncidence, avgDeath }; 
        });

        const minIncidence = d3.min(centroids, d => d.avgIncidence) || 0; 
        const maxIncidence = d3.max(centroids, d => d.avgIncidence) || 1.5;
        const maxRate = d3.max(centroids, d => d.rate) || 1;
        
        d3.select("#hotspot-min").text(minIncidence.toFixed(2)); 
        d3.select("#hotspot-max").text(maxIncidence.toFixed(2));

        // Update Table
        const tableBody = d3.select("#hotspot-table-body");
        tableBody.selectAll("*").remove();
        
        const sortedCentroids = [...centroids].sort((a, b) => b.rate - a.rate);
        
        // Update Summary Card
        const summaryCard = document.getElementById("hotspot-summary");
        const summaryContent = document.getElementById("hotspot-summary-content");
        if (summaryCard && summaryContent) {
            summaryCard.style.display = "block";
            const top3 = sortedCentroids.slice(0, 3);
            const highRiskCount = centroids.filter(c => c.rate > (maxRate * 0.7)).length;
            const diseaseName = document.getElementById("disease-select").options[document.getElementById("disease-select").selectedIndex].text;
            
            summaryContent.innerHTML = `
                <div style="margin-bottom: 8px;"><strong>${diseaseName}</strong> surveillance identifies <strong>${highRiskCount}</strong> districts at critical risk levels.</div>
                <div style="font-size: 0.65rem; color: var(--text-secondary); text-transform: uppercase; font-weight: 800; margin-bottom: 4px;">Top High-Intensity Zones:</div>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    ${top3.map((d, i) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: rgba(239, 68, 68, 0.1); border-radius: 4px; border-left: 3px solid #ef4444;">
                            <span style="font-weight: 700;">${i+1}. ${d.name}</span>
                            <span style="color: #ef4444; font-weight: 800;">${d.rate.toFixed(1)}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        sortedCentroids.forEach(d => {
            const row = tableBody.append("tr").style("border-bottom", "1px solid var(--border-color)");
            row.append("td").style("padding", "8px 4px").style("font-weight", "600").text(d.name);
            row.append("td").style("padding", "8px 4px").text(d.cases.toLocaleString());
            row.append("td").style("padding", "8px 4px").style("color", hotspotColorScale(d.avgIncidence)).style("font-weight", "700").text(d.avgIncidence.toFixed(2) + "%");
            row.append("td").style("padding", "8px 4px").style("color", "#ef4444").style("font-weight", "600").text(d.avgDeath.toFixed(3) + "%");
            row.append("td").style("padding", "8px 4px").style("font-weight", "700").text(d.rate.toFixed(1));
        });
        
        hotspotLayer.selectAll(".hotspot-circle")
            .data(centroids)
            .enter()
            .append("circle")
            .attr("class", "hotspot-circle")
            .attr("cx", d => d.centroid[0])
            .attr("cy", d => d.centroid[1])
            .attr("r", d => 5 + (d.rate / maxRate) * 40)
            .style("fill", d => hotspotColorScale(d.avgIncidence))
            .style("stroke", "white")
            .style("stroke-width", "2px")
            .style("filter", "blur(2px)")
            .style("opacity", 0.7)
            .style("pointer-events", "none");
    }

    async function loadHospitalData() {
        try {
            const hData = await d3.csv("data/raw/hospitals.csv");
            hospitalsPerDistrict = {}; hData.forEach(h => { const d = nameMapping[h.District] || h.District; hospitalsPerDistrict[d] = (hospitalsPerDistrict[d] || 0) + 1; });
            hospitalLayer.selectAll("circle").data(hData).enter().append("circle").attr("class", "hospital-marker").attr("cx", d => projection([+d.Longitude, +d.Latitude])[0]).attr("cy", d => projection([+d.Longitude, +d.Latitude])[1]).attr("r", 2).style("fill", "#ef4444").style("stroke", "white").style("stroke-width", "0.5px").style("opacity", 0)
                .on("mouseover", function(event, d) { tooltip.style("opacity", 1).html(`<div style="font-weight: 700; color: #ef4444; margin-bottom: 4px;">${d.Hospital_Name}</div><div style="font-size: 0.75rem;">${d.District}</div>`).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px"); })
                .on("mouseout", () => tooltip.style("opacity", 0));
        } catch (e) { console.error("Error loading hospitals:", e); }
    }

    async function initAI() {
        try {
            const data = await d3.csv("data/raw/dataset.csv");
            const diseaseMap = new Map(); const counts = {};
            data.forEach(row => { const disease = row.Disease.trim(); if (!diseaseMap.has(disease)) diseaseMap.set(disease, new Set()); Object.keys(row).forEach(key => { if (key.startsWith("Symptom") && row[key]) { const s = row[key].trim().toLowerCase().replace(/_/g, " "); diseaseMap.get(disease).add(s); counts[s] = (counts[s] || 0) + 1; } }); });
            const total = data.length; for (let s in counts) symptomWeights[s] = Math.log(total / (counts[s] + 1)) + 1;
            symptomDataset = Array.from(diseaseMap.entries()).map(([disease, symptoms]) => ({ disease, symptoms: Array.from(symptoms) }));
            console.log("🧠 ML Model trained with symptom weights.");
        } catch (e) { console.error("AI Init Error:", e); }
    }

    const dietKnowledge = {
        "Malaria": { morning: "Warm water with Lemon, Oats or Ragi Porridge", afternoon: "Steamed Rice with Dal, Coconut Water", night: "Clear Vegetable Soup, Moong Dal Khichdi" },
        "Dengue": { morning: "Papaya Leaf Extract (small amount), Fresh Fruit Bowl", afternoon: "Electrolyte-rich juices, Pomegranate, Boiled Egg", night: "Light Vegetable Broth, Soft Steamed Rice" },
        "Fungal infection": { morning: "Curd/Yogurt (Probiotics), Garlic-infused tea", afternoon: "Green leafy vegetables, Whole grain bread", night: "Turmeric Milk, Light salad with olive oil" },
        "default": { morning: "Warm fluids, Seasonal fruits", afternoon: "Balanced meal with protein and veggies", night: "Light, non-spicy dinner" }
    };

    try {
        geoData = await d3.json("data/raw/districts_geo.json");
        const padding = 40; projection.fitExtent([[padding, padding], [width - padding, height - padding]], geoData);
        g.selectAll("path").data(geoData.features).enter().append("path").attr("class", "district").attr("d", path)
            .on("mouseover", function(event, d) {
                const name = d.properties.district || d.properties.name; const val = currentAggregatedData[name] || 0; const metricLabel = document.getElementById("metric-select").options[document.getElementById("metric-select").selectedIndex].text;
                tooltip.style("opacity", 1).html(`<strong>${name}</strong><br/>${metricLabel}: ${val.toLocaleString()}`).style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 15) + "px");
                d3.select(this).style("stroke", "#0ea5e9").style("stroke-width", "2px");
            })
            .on("mouseout", function() { tooltip.style("opacity", 0); d3.select(this).style("stroke", "#cbd5e1").style("stroke-width", "0.5px"); })
            .on("dblclick", function(event, d) { if (event) event.stopPropagation(); const name = d.properties.district || d.properties.name; if (focusedDistrict === name) resetView(); else focusOnDistrict(event, d, name); });
        await loadDiseaseData(document.getElementById("disease-select").value); await loadHospitalData(); await initAI();
    } catch (e) { console.error("Init Error:", e); }

    const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", (e) => g.attr("transform", e.transform)); svg.call(zoom);
    function focusOnDistrict(event, d, name) { focusedDistrict = name; g.selectAll(".district").transition().duration(500).style("opacity", f => (f.properties.district || f.properties.name) === name ? 1 : 0.1).style("pointer-events", f => (f.properties.district || f.properties.name) === name ? "auto" : "none"); const hChecked = document.getElementById("hospital-toggle").checked; hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", h => (h.District === name || nameMapping[h.District] === name) && hChecked ? 1 : 0); const [[x0, y0], [x1, y1]] = path.bounds(d); svg.transition().duration(800).call(zoom.transform, d3.zoomIdentity.translate(width/2, height/2).scale(Math.min(10, 0.9/Math.max((x1-x0)/width, (y1-y0)/height))).translate(-(x0+x1)/2, -(y0+y1)/2)); }
    function resetView() { focusedDistrict = null; g.selectAll(".district").transition().duration(500).style("opacity", 1).style("pointer-events", "auto"); const hChecked = document.getElementById("hospital-toggle").checked; hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", hChecked ? 1 : 0); svg.transition().duration(800).call(zoom.transform, d3.zoomIdentity); }
    document.getElementById("disease-select").addEventListener("change", (e) => loadDiseaseData(e.target.value));
    document.getElementById("year-select").addEventListener("change", () => { currentForecastMode = null; processAndDisplayData(); generateForecast(); });
    document.getElementById("metric-select").addEventListener("change", () => { processAndDisplayData(); generateForecast(); });
    document.getElementById("hospital-toggle").addEventListener("change", function() { hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", this.checked ? 1 : 0); if (focusedDistrict) focusOnDistrict(null, geoData.features.find(f => (f.properties.district || f.properties.name) === focusedDistrict), focusedDistrict); });
    document.getElementById("hotspot-toggle").addEventListener("change", function() {
        updateHotspotMap();
        if (this.checked) switchToTab('hotspot');
        else if (document.querySelector('.intel-btn[data-target="hotspot"]').classList.contains('active')) {
            switchToTab('filters');
        }
    });
    document.getElementById("reset-zoom").addEventListener("click", resetView);
    document.getElementById("zoom-in").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 1.5));
    document.getElementById("zoom-out").addEventListener("click", () => svg.transition().call(zoom.scaleBy, 0.7));
    function switchToTab(tabId) {
        const btn = document.querySelector(`.intel-btn[data-target="${tabId}"]`);
        if (btn) {
            document.querySelectorAll(".intel-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".sidebar-section").forEach(s => s.classList.remove("active"));
            btn.classList.add("active");
            const targetSection = document.getElementById(`section-${tabId}`);
            if (targetSection) targetSection.classList.add("active");

            // Auto-enable Hotspot Map if Hotspot Tab is selected
            if (tabId === 'hotspot') {
                const toggle = document.getElementById("hotspot-toggle");
                if (!toggle.checked) {
                    toggle.checked = true;
                    updateHotspotMap();
                }
            }
        }
    }

    document.querySelectorAll(".intel-btn").forEach(btn => { 
        btn.addEventListener("click", function() { 
            switchToTab(this.getAttribute("data-target"));
        }); 
    });

    // Handle Deep Linking from other pages
    if (window.location.hash === "#chat") switchToTab("chat");
    if (window.location.hash === "#trends" || window.location.hash === "#forecast") switchToTab("forecast");
    if (window.location.hash === "#hotspot") switchToTab("hotspot");

    const chatBox = document.getElementById("chat-box"); const userInput = document.getElementById("user-input"); const sendBtn = document.getElementById("send-btn");
    function appendMessage(role, text) { const msg = document.createElement("div"); msg.className = `message ${role}`; msg.innerHTML = text; chatBox.appendChild(msg); chatBox.scrollTop = chatBox.scrollHeight; }

    async function processChat() {
        const text = userInput.value.trim(); if (!text) return;
        const lowText = text.toLowerCase();
        appendMessage("user", text); userInput.value = "";
        
        let targetDistrict = null; districtList.forEach(d => { if (lowText.includes(d.toLowerCase())) targetDistrict = d; });
        let targetMetric = "Total_Cases";
        for (let k in metricMap) { if (lowText.includes(k)) targetMetric = metricMap[k]; }

        try {
            const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }) });
            if (response.ok) {
                const result = await response.json();
                const district = result.district || targetDistrict;
                if (district) {
                    const targetKey = nameMapping[district] || district;
                    const feature = geoData.features.find(f => (f.properties.district || f.properties.name) === targetKey);
                    if (result.intent === "hospital" || lowText.includes("hospital")) {
                        const count = hospitalsPerDistrict[targetKey] || 0;
                        appendMessage("ai", `There are <strong>${count}</strong> registered hospitals in <strong>${district}</strong>. I've highlighted them for you.`);
                        if (feature) focusOnDistrict(null, feature, targetKey);
                        document.getElementById("hospital-toggle").checked = true;
                        hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", 1);
                        return;
                    } else if (lowText.includes("how many") || lowText.includes("cases") || lowText.includes("number") || lowText.includes("count") || lowText.includes("rainfall") || lowText.includes("temperature")) {
                        let total = 0; let count = 0;
                        const year = document.getElementById("year-select").value;
                        const disease = document.getElementById("disease-select").options[document.getElementById("disease-select").selectedIndex].text;
                        csvDataGlobal.forEach(d => {
                            let dDist = d.District; if (nameMapping[dDist]) dDist = nameMapping[dDist];
                            if (dDist === targetKey && (year === "all" || d.Year === year)) {
                                const val = parseFloat(d[targetMetric]);
                                if (!isNaN(val)) { total += val; count++; }
                            }
                        });
                        const metricLabel = targetMetric.replace(/_/g, ' ');
                        const finalVal = (targetMetric.includes("Rate") || targetMetric === "Temperature" || targetMetric === "Rainfall") ? (total / (count || 1)).toFixed(2) : total.toLocaleString();
                        const unit = targetMetric === "Temperature" ? "°C" : (targetMetric === "Rainfall" ? "mm" : "");
                        appendMessage("ai", `In <strong>${district}</strong>, the <strong>${metricLabel}</strong> for ${disease} is <strong>${finalVal}${unit}</strong>.`);
                        if (feature) focusOnDistrict(null, feature, targetKey);
                        return;
                    }
                }
                if (result.disease && result.confidence > 0.35) {
                    chatState.disease = result.disease; chatState.step = 'awaiting_days';
                    appendMessage("ai", `Based on symptoms, I suspect <strong>${result.disease}</strong>. How many days have you been experiencing this?`);
                    return;
                }
            }
        } catch (e) { console.warn("Backend unavailable, using enhanced local model."); }

        if (chatState.step === 'awaiting_days') {
            const info = dietKnowledge[chatState.disease] || dietKnowledge["default"];
            let html = `<div style="margin-bottom:10px;"><strong style="color:var(--accent-color);">Nutrition Plan for ${chatState.disease} Recovery</strong></div>`;
            html += `<div style="font-size:0.8rem; border-left:2px solid var(--accent-color); padding-left:10px; line-height:1.6;"><strong>Morning:</strong> ${info.morning}<br/><strong>Afternoon:</strong> ${info.afternoon}<br/><strong>Night:</strong> ${info.night}</div>`;
            html += `<div style="font-size:0.7rem; color:var(--text-secondary); margin-top:8px; font-style:italic;">* Please consult a medical professional for clinical treatment.</div>`;
            appendMessage("ai", html); chatState = { step: 'idle', disease: null }; return;
        }

        if (targetDistrict) {
            const targetKey = nameMapping[targetDistrict] || targetDistrict;
            const feature = geoData.features.find(f => (f.properties.district || f.properties.name) === targetKey);
            if (lowText.includes("hospital")) {
                const count = hospitalsPerDistrict[targetKey] || 0;
                appendMessage("ai", `Found <strong>${count}</strong> hospitals in <strong>${targetDistrict}</strong>. Activating hospital layer.`);
                if (feature) focusOnDistrict(null, feature, targetKey);
                document.getElementById("hospital-toggle").checked = true;
                hospitalLayer.selectAll(".hospital-marker").transition().duration(500).style("opacity", 1);
                return;
            } else {
                let total = 0; let count = 0;
                const year = document.getElementById("year-select").value;
                const disease = document.getElementById("disease-select").options[document.getElementById("disease-select").selectedIndex].text;
                csvDataGlobal.forEach(d => {
                    let dDist = d.District; if (nameMapping[dDist]) dDist = nameMapping[dDist];
                    if (dDist === targetKey && (year === "all" || d.Year === year)) {
                        const val = parseFloat(d[targetMetric]);
                        if (!isNaN(val)) { total += val; count++; }
                    }
                });
                const finalVal = (targetMetric.includes("Rate") || targetMetric === "Temperature" || targetMetric === "Rainfall") ? (total / (count || 1)).toFixed(2) : total.toLocaleString();
                const unit = targetMetric === "Temperature" ? "°C" : (targetMetric === "Rainfall" ? "mm" : "");
                appendMessage("ai", `Current <strong>${targetMetric.replace(/_/g, ' ')}</strong> for <strong>${targetDistrict}</strong>: <strong>${finalVal}${unit}</strong>.`);
                if (feature) focusOnDistrict(null, feature, targetKey);
                return;
            }
        }

        let best = null; let max = 0;
        const symptomsFound = [];
        symptomDataset.forEach(d => { 
            let score = 0; 
            d.symptoms.forEach(s => { 
                if (lowText.includes(s) || (s.includes(' ') && s.split(' ').every(p => lowText.includes(p)))) {
                    score += (symptomWeights[s] || 1.5);
                    if (!symptomsFound.includes(s)) symptomsFound.push(s);
                }
            }); 
            if (score > max) { max = score; best = d.disease; } 
        });

        // Boost scores if keywords like 'fever' or 'cold' are present
        if (lowText.includes("fever") && symptomsFound.length === 0) { max = 2; best = "Common Cold"; } 

        if (best && (max > 1.2 || symptomsFound.length > 0)) { 
            chatState = { step: 'awaiting_days', disease: best }; 
            appendMessage("ai", `Clinical patterns match <strong>${best}</strong> based on your symptoms. How many days since they started?`); 
        }
        else {
            appendMessage("ai", "I'm listening. I can help with clinical symptoms, hospital locations, or data statistics. Try describing your symptoms or ask: 'Where are the hospitals in Kurnool?'");
        }
    }
    sendBtn.addEventListener("click", processChat);
    userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") processChat(); });
}
document.addEventListener("DOMContentLoaded", startDashboard);
