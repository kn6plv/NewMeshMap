
let map = null;
const mapStyles = {
    standard: {
        version: 8,
        sources: {
            osm: {
                type: "raster",
                tiles: [ "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png" ],
                tileSize: 256,
                attribution: "&copy; OpenStreetMap Contributors",
                maxzoom: 19
            }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
    },
    topology: {
        version: 8,
        sources: {
            osm: {
                type: "raster",
                tiles: [ "https://a.tile.opentopomap.org/{z}/{x}/{y}.png" ],
                tileSize: 256,
                attribution: "&copy; OpenStreetMap Contributors",
                maxzoom: 19
            }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
    },
    satellite: {
        version: 8,
        sources: {
            osm: {
                type: "raster",
                tiles: [ "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" ],
                tileSize: 256,
                attribution: "&copy; Google",
                maxzoom: 19
            }
        },
        layers: [{ id: "osm", type: "raster", source: "osm" }]
    }
};
const nodes = {};
const markers = {};
const rf = { type: "FeatureCollection", features: [] };
const tun = { type: "FeatureCollection", features: [] };
const xlink = { type: "FeatureCollection", features: [] };
const supertun = { type: "FeatureCollection", features: [] };
const longdtd = { type: "FeatureCollection", features: [] };
const radioColors = {
    "2": "purple",
    "3": "blue",
    "5": "orange",
    "9": "magenta",
    "s": "green",
    "n": "gray"
};
let rf9 = 0;
let rf2 = 0;
let rf3 = 0;
let rf5 = 0;
let sn = 0;
let nrf = 0;
let filterKeyColor = null;
let linkPopup = null;
const measurements = { type: "FeatureCollection", features: [] };
let lastMarkerClickEvent = null;

function toRadians(d) {
    return d * Math.PI / 180;
}
   
function toDegrees(r) {
    return r * 180 / Math.PI;
}

function getRealLatLon(n) {
    if (n) {
        return { lat: n.lat || n.mlat, lon: n.lon || n.mlon };
    }
    return {};
}

function getVirtualLatLon(n) {
    if (n) {
        if (n.mlat && n.lat && n.mlon && n.lon) {
            return { lat: parseFloat(n.lat) + (n.mlat - n.lat) / 10, lon: parseFloat(n.lon) + (n.mlon - n.lon) / 10 };
        }
        else {
            return { lat: n.mlat || n.lat, lon: n.mlon || n.lon };
        }
    }
    return {};
}

function bearingAndDistance(from, to) {
    const flat = toRadians(from[0]);
    const flon = toRadians(from[1]);
    const tlat = toRadians(to[0]);
    const tlon = toRadians(to[1]);

    const y = Math.sin(tlon - flon) * Math.cos(tlat);
    const x = Math.cos(flat) * Math.sin(tlat) - Math.sin(flat) * Math.cos(tlat) * Math.cos(tlon - flon);

    const dLat = toRadians(to[0] - from[0]);
    const dLon = toRadians(to[1] - from[1]);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(flat) * Math.cos(tlat); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 

    return {
        distance: (3963 * c).toFixed(1),
        bearing: ((toDegrees(Math.atan2(y, x)) + 360) % 360).toFixed(0)
    };
}

function getFreqRange(freq, chanbw) {
    freq = parseInt(freq - chanbw / 2);
    return `${freq}-${freq + parseInt(chanbw)} MHz`;
}

function canonicalHostname(hostname) {
    return hostname.replace(/^\./, "").replace(/\.local\.mesh$/i,"").toUpperCase();
}

function openPopup(chostname) {
    for (m in markers) {
        if (markers[m].getPopup().isOpen()) {
            markers[m].togglePopup();
        }
    }
    if (linkPopup) {
        linkPopup.remove();
        linkPopup = null;
    }
    const marker = markers[chostname];
    if (marker && marker._map) {
        map.flyTo({ center: marker.getLngLat(), speed: 1 });
        marker.togglePopup();
    }
}

function radioColor(d) {
    if (d.node_details.mesh_supernode) {
        return "green";
    }
    const rf = d.meshrf;
    const chan = parseInt(rf.channel);
    if (chan >= 3380 && chan <= 3495) {
        return "blue";
    }
    return radioColors[(rf.freq || "X")[0]] || "gray";
}

function radioAzimuth(d) {
    const a = d.meshrf.azimuth;
    if (isNaN(a)) {
        return 0;
    }
    return 180 + parseInt(a);
}

function createMarkers() {
    for (cname in nodes) {
        const data = nodes[cname].data;
        const loc = getVirtualLatLon(data);
        if (loc.lat && loc.lon) {
            markers[cname] = new maplibregl.Marker({ className: "marker", color: radioColor(data), scale: 0.75, pitchAlignment: "viewport", rotationAlignment: "map", rotation: radioAzimuth(data) }).setLngLat([ loc.lon, loc.lat ]).setPopup(makePopup(data));
            markers[cname].getElement().addEventListener("click", e => lastMarkerClickEvent = e);
        }
    }
}

function updateMarkers() {
    for (cname in markers) {
        const m = markers[cname];
        m.remove();
        if (!filterKeyColor || filterKeyColor == m._color) {
            m.addTo(map);
        }
    }
}

function updateSources() {
    map.getSource("rf").setData(rf);
    map.getSource("tun").setData(tun);
    map.getSource("xlink").setData(xlink);
    map.getSource("supertun").setData(supertun);
    map.getSource("longdtd").setData(longdtd);
}

function loadMap() {
    map = new maplibregl.Map({
        container: "map",
        style: mapStyles.standard,
        center: [ config.lon, config.lat ],
        zoom: config.zoom,
        hash: true
    });
    map.addControl(new maplibregl.NavigationControl({
        visualizePitch: true
    }), "bottom-right");
    map.on("style.load", () => {
        map.addSource("rf", { type: "geojson", data: rf });
        map.addLayer({ id: "rf", type: "line", source: "rf", paint: { "line-color": "limegreen", "line-width": 2 } });
        map.addSource("tun", { type: "geojson", data: tun });
        map.addLayer({ id: "tun", type: "line", source: "tun", paint: { "line-color": "gray", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("xlink", { type: "geojson", data: xlink });
        map.addLayer({ id: "xlink", type: "line", source: "xlink", paint: { "line-color": "limegreen", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("supertun", { type: "geojson", data: supertun });
        map.addLayer({ id: "supertun", type: "line", source: "supertun", paint: { "line-color": "blue", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("longdtd", { type: "geojson", data: longdtd });
        map.addLayer({ id: "longdtd", type: "line", source: "longdtd", paint: { "line-color": "limegreen", "line-width": 2, "line-dasharray": [ 1,  1 ] } });
        map.addSource("measurement", { type: "geojson", data: measurements });
        map.addLayer({ id: "measurement-points", type: "circle", source: "measurement", paint: { "circle-radius": 5, "circle-color": "red" }, filter: ["in", "$type", "Point"] });
        map.addLayer({ id: "measurement-lines", type: "line", source: "measurement", paint: { "line-width": 2, "line-color": "red" }, filter: ["in", "$type", "LineString"] });
    });
    createMarkers();
    updateMarkers();
    document.querySelector("#ctrl select").innerHTML = Object.keys(mapStyles).map(style => `<option>${style}</option>`)
}

function selectMap(v) {
    const style = mapStyles[v];
    if (style) {
        map.setStyle(style, { diff: false });
    }
}

function filterKey(color) {
    color = radioColors[color];
    if (color === filterKeyColor) {
        filterKeyColor = null;
    }
    else {
        filterKeyColor = color;
    }
    updateLinks();
    updateKey();
    updateMarkers();
    updateSources();
}

function updateKey() {
    function sel(c) {
        return !filterKeyColor || filterKeyColor == radioColors[c];
    }
    const key = document.getElementById("key");
    key.innerHTML = `
<div class="title">${config.title}</div>
<table>
<tr><td>Band</td><td>Nodes</td></tr>
${rf9 ? "<tr class='" + sel("9") + "'><td><div class='mark' style='background-color: " + radioColors["9"] + "'></div> <a href='#' onclick='filterKey(\"9\")'>900 MHz</a></td><td>" + rf9 + "</td></tr>" : ""}
${rf2 ? "<tr class='" + sel("2") + "'><td><div class='mark' style='background-color: " + radioColors["2"] + "'></div> <a href='#' onclick='filterKey(\"2\")'>2.4 GHz</a></td><td>" + rf2 + "</td></tr>" : ""}
${rf3 ? "<tr class='" + sel("3") + "'><td><div class='mark' style='background-color: " + radioColors["3"] + "'></div> <a href='#' onclick='filterKey(\"3\")'>3.4 GHz</a></td><td>" + rf3 + "</td></tr>" : ""}
${rf5 ? "<tr class='" + sel("5") + "'><td><div class='mark' style='background-color: " + radioColors["5"] + "'></div> <a href='#' onclick='filterKey(\"5\")'>5 GHz</a></td><td>" + rf5 + "</td></tr>" : ""}
${sn  ? "<tr class='" + sel("s") + "'><td><div class='mark' style='background-color: " + radioColors["s"] + "'></div> <a href='#' onclick='filterKey(\"s\")'>Supernode</a></td><td>" + sn + "</td></tr>" : ""}
${nrf ? "<tr class='" + sel("n") + "'><td><div class='mark' style='background-color: " + radioColors["n"] + "'></div> <a href='#' onclick='filterKey(\"n\")'>No RF</a></td><td>" + nrf + "</td></tr>" : ""}
<tr><td>Total</td><td>${out.nodeInfo.length}</td></tr>
</table>
<div class="footer">
<div>Last updated ${new Date(out.date).toLocaleString()}</div></div>
</div>
    `;
}

function countRadios() {
    for (cname in nodes) {
        const node = nodes[cname];
        const d = node.data;
        if (d.node_details.mesh_supernode) {
            sn++;
        }
        else {
            const rf = d.meshrf;
            const chan = parseInt(rf.channel);
            if (chan >= 3380 && chan <= 3495) {
                rf3++;
            }
            else switch ((rf.freq || "X")[0]) {
                case "2":
                    rf2++;
                    break;
                case "3":
                    rf3++;
                    break;
                case "5":
                    rf5++;
                    break;
                case "9":
                    rf9++;
                    break;
                default:
                    nrf++;
                    break;
            }
        }
    }
}

function updateLinks() {
    rf.features.length = 0;
    tun.features.length = 0;
    xlink.features.length = 0;
    supertun.features.length = 0;
    longdtd.features.length = 0;
    const done = {};
    for (cname in nodes) {
        const node = nodes[cname];
        const d = node.data;
        if (filterKeyColor && filterKeyColor !== radioColor(d)) {
            continue;
        }
        const dloc = getVirtualLatLon(d);
        const link_info = d.link_info;
        for (ip in link_info) {
            let link = null;
            const l = link_info[ip];
            const chostname = canonicalHostname(l.hostname);
            const hn = nodes[chostname];
            if (hn && filterKeyColor && filterKeyColor !== radioColor(hn.data)) {
                continue;
            }
            const hloc = getVirtualLatLon(hn && hn.data);
            if (dloc.lat && dloc.lon && hloc.lat && hloc.lon) {
                const id = `${cname}/${chostname}`;
                if (!done[id] && !done[`${chostname}/${cname}`]) {
                    done[id] = true;
                    link = { type: "Feature", properties: { from: cname, to: chostname }, geometry: { type: "LineString", coordinates: [[ dloc.lon, dloc.lat ], [ hloc.lon, hloc.lat ]] } };
                }
            }
            if (link) {
                switch (l.linkType || "X") {
                    case "RF":
                        rf.features.push(link);
                        break;
                    case "TUN":
                    case "WIREGUARD":
                        tun.features.push(link);
                        break;
                    case "XLINK":
                        xlink.features.push(link);
                        break;
                    case "SUPER":
                        supertun.features.push(link);
                        break;
                    case "DTD":
                        const bd = bearingAndDistance(link.geometry.coordinates[0], link.geometry.coordinates[1]);
                        if (bd.distance > 0.03) {
                            longdtd.features.push(link);
                        }
                        break;
                    default:
                        break;
                }
            }
        }
    }
}

function makePopup(d) {
    const i = d.node_details;
    const rf = d.meshrf;
    const cname = canonicalHostname(d.node);
    const dloc = getVirtualLatLon(d);
    const neighbors = Object.values(d.link_info).map(l => {
        const chostname = canonicalHostname(l.hostname);
        const hn = nodes[chostname];
        const hloc = getVirtualLatLon(hn && hn.data);
        switch (l.linkType || "X") {
            case "RF":
            {
                if (dloc.lat && dloc.lon && hloc.lat && hloc.lon) {
                    const bd = bearingAndDistance([ dloc.lat, dloc.lon ], [ hloc.lat, hloc.lon ]);
                    let sigf = l.signal - l.noise;
                    if (isNaN(sigf)) {
                        sigf = '-';
                    }
                    const hl = Object.values(hn.data.link_info).find(info => canonicalHostname(info.hostname) === cname);
                    let sigt = hl ? hl.signal - hl.noise : '-';
                    if (isNaN(sigt)) {
                        sigt = '-';
                    }
                    return `<div><a href="#" onclick="openPopup('${chostname}')">${chostname}</a> <span>${l.linkType}</span></div><div class="bearing">${sigf} dB \u2190 ${bd.bearing}\u00B0 ${bd.distance} miles \u2192 ${sigt} dB</div>`;
                }
                return `<div>${chostname} <span>RF</span></div>`;
            }
            case "XLINK":
            {
                if (dloc.lat && dloc.lon && hloc.lat && hloc.lon) {
                    const bd = bearingAndDistance([ dloc.lat, dloc.lon ], [ hloc.lat, hloc.lon ]);
                    return `<div><a href="#" onclick="openPopup('${chostname}')">${chostname}</a> <span>XLINK</span></div><div class="bearing">${bd.bearing}\u00B0 ${bd.distance} miles</div>`;
                }
                return `<div>${chostname} <span>XLINK</span>`;
            }
            case "TUN":
            case "WIREGUARD":
            {
                if (dloc.lat && dloc.lon && hloc.lat && hloc.lon) {
                    return `<div><a href="#" onclick="openPopup('${chostname}')">${chostname}</a> <span>${l.linkType}</span></div>`;
                }
                return `<div>${chostname} <span>${l.linkType}</span>`;
            }
            case "DTD":
            case "SUPER":
                if (dloc.lat && dloc.lon && hloc.lat && hloc.lon) {
                    return `<div><a href="#" onclick="openPopup('${chostname}')">${chostname}</a> <span>${l.linkType}</span></div>`;
                }
                return `<div>${chostname} <span>${l.linkType}</span></div>`;
            default:
                return `<div>${chostname}</div>`;
        }
    });
    neighbors.sort();
    const todayStart = new Date().setHours(0, 0, 0, 0) / 1000;
    const yesterdayStart = todayStart - 24 * 60 * 60;
    const weekStart = todayStart - 7 * 24 * 60 * 60;
    const lines = `
<div class="name"><a href="http://${d.node}.local.mesh/" target="_blank">${d.node}</a></div>
<table>
${i.description ? "<tr><td>Description</td><td>" + i.description.replace("&deg;", "\u00B0") + "</td></tr>" : ""}
<tr><td>Location</td><td>${dloc.lat},${dloc.lon}</td></tr>
${rf.antenna && rf.antenna.description ? "<tr><td>Antenna</td><td>" + rf.antenna.description.replace("&deg;", "\u00B0") + "</td></tr>" : ""}
${!isNaN(rf.height) ? "<tr><td>Height</td><td>" + rf.height + " m</td></tr>" : ""}
${!isNaN(rf.azimuth) ? "<tr><td>Azimuth</td><td>" + rf.azimuth + "&deg;</td></tr>" : ""}
${!isNaN(rf.elevation) ? "<tr><td>Elevation</td><td>" + rf.elevation + "&deg;</td></tr>" : ""}
<tr><td>Last seen</td><td>${
    d.lastseen > todayStart ? "Today" :
    d.lastseen > yesterdayStart ? "Yesterday" :
    d.lastseen > weekStart ? "The last 7 days" : "A long time ago..."
}
<tr><td>RF Status</td><td style="text-transform: capitalize">${rf.status}</td></tr>
${rf.status === 'on' ?
    "<tr><td>SSID</td><td>" + rf.ssid + "</td></tr>" +
    "<tr><td>Channel</td><td>" + rf.channel + "</td></tr>" +
    "<tr><td>Frequency</td><td>" + getFreqRange(rf.freq, rf.chanbw) + "</td></tr>" +
    "<tr><td>Bandwidth</td><td>" + rf.chanbw + " MHz</td></tr>" +
    "<tr><td>MAC</td><td>" + d.interfaces[0].mac + "</td></tr>" : ""
}
<tr><td>Hardware</td><td>${i.hardware || ""}</td></tr>
<tr><td>Firmware</td><td>${i.firmware_version || ""}</td></tr>
<tr><td>Neighbors</td><td class="neighbors">${neighbors.join("") || "<div>None</div>"}</td></tr>
</table>`;
    return new maplibregl.Popup({
        className: "description",
        closeButton: false,
        maxWidth: "500px",
        focusAfterOpen: false,
        anchor: "bottom-left",
        offset: [ 0, -16 ]
    }).setHTML(lines);
}

function createMeasurementTool() {
    map.on("click", e => {
        if (map.getCanvas().style.cursor !== "crosshair") {
            return;
        }
        const point = {
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [ e.lngLat.lng, e.lngLat.lat ]
            },
            properties: {}
        };
        switch (measurements.features.length) {
            case 0:
            case 1:
            case 3:
                measurements.features.length = 1;
                measurements.features[0] = point;
                map.getSource('measurement').setData(measurements);
                break;
            case 2:
                measurements.features[2] = point;
                map.getSource('measurement').setData(measurements);
                break;
            default:
                break;
        }
    });
    map.on("mousemove", e => {
        if (map.getCanvas().style.cursor !== "crosshair") {
            return;
        }
        switch (measurements.features.length) {
            case 1:
            case 2:
                const start = measurements.features[0].geometry.coordinates;
                measurements.features[1] = {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: [ start, [ e.lngLat.lng, e.lngLat.lat ] ]
                    },
                    properties: {}
                };
                map.getSource('measurement').setData(measurements);
                const bd = bearingAndDistance( [ start[1], start[0] ], [ e.lngLat.lat, e.lngLat.lng ] );
                document.getElementById("mb").innerHTML = bd.bearing;
                document.getElementById("md").innerHTML = bd.distance;
                break;
            default:
                break;
        }
    });
    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && map.getCanvas().style.cursor === "crosshair") {
            toggleMeasure();
        }
    });
}

function toggleMeasure() {
    if (map.getCanvas().style.cursor === "crosshair") {
        document.getElementById("mb").innerHTML = "---";
        document.getElementById("md").innerHTML = "--.-";
        measurements.features.length = 0;
        map.getSource('measurement').setData(measurements);
        map.getCanvas().style.cursor = null;
    }
    else {
        map.getCanvas().style.cursor = "crosshair";
    }
}

function createLinkTool() {
    const size = 10;
    map.on("click", e => {
        if (map.getCanvas().style.cursor === "crosshair" || e.originalEvent === lastMarkerClickEvent) {
            return;
        }
        const features = map.queryRenderedFeatures([
            [e.point.x - size / 2, e.point.y - size / 2],
            [e.point.x + size / 2, e.point.y + size / 2]
        ]);
        if (features.length) {
            const p = features[0].properties;
            openPopup();
            linkPopup = new maplibregl.Popup({
                className: "link-description",
                closeButton: false,
                maxWidth: "500px",
                focusAfterOpen: false,
                anchor: "bottom",
            }).setHTML(`<a href="#" onclick="openPopup('${p.from}')">${p.from}</a> &harr; <a href="#" onclick="openPopup('${p.to}')">${p.to}</a>`);
            linkPopup.setLngLat(e.lngLat);
            linkPopup.addTo(map);
        }
    });
    map.on("mousemove", e => {
        if (map.getCanvas().style.cursor === "crosshair") {
            return;
        }
        const features = map.queryRenderedFeatures([
            [e.point.x - size / 2, e.point.y - size / 2],
            [e.point.x + size / 2, e.point.y + size / 2]
        ]);
        if (features.length) {
            map.getCanvas().style.cursor = "pointer";
        }
        else {
            map.getCanvas().style.cursor = null;
        }
    });
}

function start() {
    out.nodeInfo.forEach(node => {
        nodes[canonicalHostname(node.data.node)] = node;
    });
    updateLinks();
    countRadios();
    updateKey();
    loadMap();
    createMeasurementTool();
    createLinkTool();
}

window.addEventListener("load", start);
