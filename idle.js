function idle() {
    let idle = null;
    const tour = {
        idling: false,
        next: 0,
        steps: config.tour || [ "standard", `${config.zoom}/${config.lat}/${config.lon}`, `wait ${config.idle}` ]
    };
    function tourStep() {
        idle = null;
        for (;;) {
            const step = tour.steps[tour.next];
            tour.next = (tour.next + 1) % tour.steps.length;
            if (step.indexOf("wait") === 0) {
                const wait = parseFloat(step.substring(4)) || 30;
                idle = setTimeout(tourStep, wait * 1000);
                break;
            }
            else if (step.indexOf("rotate") === 0) {
                let rotTime = parseFloat(step.substring(6)) || 30;
                const halfRotTime = 30;
                function rot() {
                    if (idle) {
                        return;
                    }
                    else if (rotTime > 0) {
                        const time = Math.min(rotTime, halfRotTime);
                        rotTime -= time;
                        map.rotateTo((map.getBearing() + 179.9 / halfRotTime * time) % 360, { duration: time * 1000, easing: t => t });
                        map.once("moveend", rot);
                    }
                    else {
                        tourStep();
                    }
                }
                rot();
                break;
            }
            else if (step.indexOf("open") === 0) {
                const chostname = step.substring(4).trim().toUpperCase();
                const marker = markers[chostname];
                if (marker && marker._map) {
                    openPopup();
                    marker.togglePopup();
                }
            }
            else if (step === "random") {
                const nodes = Object.values(markers);
                const marker = nodes[Math.min(nodes.length - 1, Math.floor(Math.random() * nodes.length))];
                if (marker._map) {
                    openPopup();
                    marker.togglePopup();
                }
                map.flyTo({ center: marker.getLngLat(), speed: 1, zoom: 15, pitch: 60, bearing: 0 });
                map.once("moveend", () => {
                    if (!idle) {
                        tourStep();
                    }
                });
                break;

            }
            else if (mapStyles[step]) {
                selectMap(step);
            }
            else {
                const loc = step.split("/");
                if (loc.length === 3) {
                    loc.push(0, 0);
                }
                if (loc.length == 5) {
                    openPopup();
                    map.flyTo({ center: [ parseFloat(loc[2]), parseFloat(loc[1]) ], speed: 1, zoom: parseFloat(loc[0]), pitch: parseFloat(loc[4]), bearing: parseFloat(loc[3]) });
                    map.once("moveend", () => {
                        if (!idle) {
                            tourStep();
                        }
                    });
                    break;
                }
            }
        }
    }
    function notIdle() {
        tour.next = 0;
        clearTimeout(idle);
        idle = setTimeout(function() {
            tour.idling = true;
            openPopup();
            filterKey();
            setMode("normal");
            tourStep();
        }, config.idle * 1000);
        if (tour.idling) {
            tour.idling = false;
            openPopup();
            selectMap("standard");
            map.flyTo({ center: [ config.lon, config.lat ], speed: 1, zoom: config.zoom, pitch: 0, bearing: 0 });
        }
    }
    [ "mousemove", "mousedown", "touchstart", "click", "keypress", "scroll" ].forEach(function(name) {
        document.addEventListener(name, notIdle);
    });
    notIdle();
}
