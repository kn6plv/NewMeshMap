
let map = null;
let mapStyle = "mapbox://styles/mapbox/standard";
const nodes = {};
const markers = {};
const rf = [];
const tun = [];
const xlink = [];
const supertun = [];
const longdtd = [];

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
        return { lat: n.mlat || n.lat, lon: n.mlon || n.lon };
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

function canonicalHostname(hostname) {
    return hostname.replace(/^\./, '').replace(/\.local\.mesh$/i,'').toUpperCase();
}

function openPopup(chostname) {
    for (m in markers) {
        if (markers[m].getPopup().isOpen()) {
            markers[m].togglePopup();
        }
    }
    map.flyTo({ center: markers[chostname].getLngLat(), speed: 1 });
    markers[chostname].togglePopup();
}

function loadMap() {
    if (map) {
        map.remove();
    }
    map = new mapboxgl.Map({
        container: "map",
        style: mapStyle,
        center: [ config.lon, config.lat ],
        zoom: config.zoom,
        hash: true
    });
    map.on("load", () => {
        map.addSource("rf", { type: "geojson", data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: rf } } });
        map.addLayer({ id: "rf", type: 'line', source: "rf", paint: { "line-color": "limegreen", "line-width": 2 } });
        map.addSource("tun", { type: "geojson", data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: tun } } });
        map.addLayer({ id: "tun", type: 'line', source: "tun", paint: { "line-color": "gray", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("xlink", { type: "geojson", data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: xlink } } });
        map.addLayer({ id: "xlink", type: 'line', source: "xlink", paint: { "line-color": "limegreen", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("supertun", { type: "geojson", data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: supertun } } });
        map.addLayer({ id: "supertun", type: 'line', source: "supertun", paint: { "line-color": "blue", "line-width": 2, "line-dasharray": [ 3,  2 ] } });
        map.addSource("longdtd", { type: "geojson", data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: longdtd } } });
        map.addLayer({ id: "longdtd", type: 'line', source: "longdtd", paint: { "line-color": "limegreen", "line-width": 2, "line-dasharray": [ 1,  1 ] } });
        for (cname in nodes) {
            const node = nodes[cname];
            const data = node.data;
            const loc = getVirtualLatLon(data);
            if (loc.lat && loc.lon) {
                markers[cname] = new mapboxgl.Marker({ color: radioColor(data) }).setLngLat([ loc.lon, loc.lat ]).setPopup(makePopup(data)).addTo(map);
            }
        }
    });
}

function selectMap(v) {
    switch (v) {
        case "Standard":
            mapStyle = "mapbox://styles/mapbox/standard";
            loadMap();
            break;
        case "Satellite":
            mapStyle = "mapbox://styles/mapbox/satellite-streets-v12";
            loadMap();
            break;
        default:
            break;
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
    }).join("");
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
    "<tr><td>Frequency</td><td>" + rf.freq + "</td></tr>" +
    "<tr><td>Bandwidth</td><td>" + rf.chanbw + " MHz</td></tr>" +
    "<tr><td>LQM</td><td>" + (d.lqm && d.lqm.enabled ? "Enabled" : d.lqm ? "Disabled" : "Unavailable") + "</td></tr>" +
    "<tr><td>MAC</td><td>" + d.interfaces[0].mac + "</td></tr>" : ""
}
<tr><td>Hardware</td><td>${i.hardware || ""}</td></tr>
<tr><td>Firmware</td><td>${i.firmware_version || ""}</td></tr>
<tr><td>Neighbors</td><td class="neighbors">${neighbors}</td></tr>
</table>`;
    return new mapboxgl.Popup({
        className: "description",
        closeButton: false,
        maxWidth: "500px",
        focusAfterOpen: false,
        anchor: "bottom-left",
        offset: [ 0, -20 ]
    }).setHTML(lines);
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
    switch ((rf.freq || "X")[0]) {
        case "2":
            return "purple";
        case "3":
            return "blue";
        case "5":
            return "orange";
        case "9":
            return "magenta";
        default:
            return "gray";
    }
}

function start() {
    mapboxgl.accessToken = config.token;
    out.nodeInfo.forEach(node => {
        nodes[canonicalHostname(node.data.node)] = node;
    });
    const done = {};
    let rf9 = 0;
    let rf2 = 0;
    let rf3 = 0;
    let rf5 = 0;
    let sn = 0;
    let nrf = 0;
    for (cname in nodes) {
        const node = nodes[cname];
        const d = node.data;
        const link_info = d.link_info;
        for (ip in link_info) {
            let link = null;
            const l = link_info[ip];
            const chostname = canonicalHostname(l.hostname);
            const hn = nodes[chostname];
            if (hn && d.lat && d.lon && hn.data.lat && hn.data.lon) {
                const id = `${cname}/${chostname}`;
                if (!done[id] && !done[`${chostname}/${cname}`]) {
                    done[id] = true;
                    link = [[ d.lon, d.lat ], [ hn.data.lon, hn.data.lat ]];
                }
            }
            if (link) {
                switch (l.linkType || "X") {
                    case "RF":
                        rf.push(link);
                        break;
                    case "TUN":
                    case "WIREGUARD":
                        tun.push(link);
                        break;
                    case "XLINK":
                        xlink.push(link);
                        break;
                    case "SUPER":
                        supertun.push(link);
                        break;
                    case "DTD":
                        const bd = bearingAndDistance(link[0], link[1]);
                        if (bd.distance > 0.03) {
                            longdtd.push(link);
                        }
                        break;
                    default:
                        break;
                }
            }
        }
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
    
    const key = document.getElementById("key");
    key.innerHTML = `
<div class="title">${config.title}</div>
<table>
<tr><td>Band</td><td>Nodes</td></tr>
${rf9 ? "<tr><td><div class='mark' style='background-color: magenta'></div> 900 MHz</td><td>" + rf9 + "</td></tr>" : ""}
${rf2 ? "<tr><td><div class='mark' style='background-color: purple'></div> 2.4 GHz</td><td>" + rf2 + "</td></tr>" : ""}
${rf3 ? "<tr><td><div class='mark' style='background-color: blue'></div> 3.4 GHz</td><td>" + rf3 + "</td></tr>" : ""}
${rf5 ? "<tr><td><div class='mark' style='background-color: orange'></div> 5 GHz</td><td>" + rf5 + "</td></tr>" : ""}
${sn ? "<tr><td><div class='mark' style='background-color: green'></div> Supernode</td><td>" + sn + "</td></tr>" : ""}
${nrf ? "<tr><td><div class='mark'></div> No RF</td><td>" + nrf + "</td></tr>" : ""}
<tr><td>Total</td><td>${out.nodeInfo.length}</td></tr>
</table>
<div class="footer">
<div>Download CSV data <a href="data/out.csv" target="_blank">here</a></div>
<div>And KML data <a href="data/out.kml" target="_blank">here</a></div>
<div>Mesh map phone compass <a href="compass">here</a></div>
<div>Last updated ${new Date(out.date).toLocaleString()}</div></div>
</div>
    `;
    loadMap();
}

window.addEventListener("load", start);
