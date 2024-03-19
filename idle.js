function idle() {
    let idle = null;
    const patrol = {
        next: 0,
        steps: config.patrol || [ "standard", `${config.lat}/${config.lon}/${config.zoom}`, `wait ${config.idle}` ],
        moving: false
    };
    function patrolStep() {
        idle = null;
        for (;;) {
            const step = patrol.steps[patrol.next];
            patrol.next = (patrol.next + 1) % patrol.steps.length;
            patrol.moving = false;
            if (step.indexOf("wait") === 0) {
                const wait = parseFloat(step.substring(4)) || 30;
                idle = setTimeout(patrolStep, wait * 1000);
                break;
            }
            else if (step.indexOf("rotate") === 0) {
                let rotTime = parseFloat(step.substring(6)) || 30;
                const halfRotTime = 30;
                function rot() {
                    patrol.moving = false;
                    if (idle) {
                        return;
                    }
                    else if (rotTime > 0) {
                        const time = Math.min(rotTime, halfRotTime);
                        rotTime -= time;
                        map.rotateTo((map.getBearing() + 179.9 / halfRotTime * time) % 360, { duration: time * 1000, easing: t => t });
                        map.once("moveend", rot);
                        patrol.moving = true;
                    }
                    else {
                        patrolStep();
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
            else if (mapStyles[step]) {
                selectMap(step);
                document.querySelector("#ctrl select").value = step;
            }
            else {
                const loc = step.split("/");
                if (loc.length === 3) {
                    loc.push(0, 0);
                }
                if (loc.length == 5) {
                    openPopup();
                    patrol.moving = false;
                    map.flyTo({ center: [ parseFloat(loc[2]), parseFloat(loc[1]) ], speed: 1, zoom: parseFloat(loc[0]), pitch: parseFloat(loc[4]), bearing: parseFloat(loc[3]), padding: { top: 400, right: 400, bottom: 0, left: 0 } });
                    map.once("moveend", () => {
                        if (!idle) {
                            patrolStep();
                        }
                    });
                    patrol.moving = true;
                    break;
                }
            }
        }
    }
    function notIdle() {
        patrol.next = 0;
        clearTimeout(idle);
        idle = setTimeout(function() {
            openPopup();
            filterKey();
            setMode("normal");
            patrolStep();
        }, config.idle * 1000);
        if (patrol.moving) {
            patrol.moving = false;
            map.rotateTo(map.getBearing(), { duration: 0 });
        }
    }
    [ "mousemove", "mousedown", "touchstart", "click", "keypress", "scroll" ].forEach(function(name) {
        document.addEventListener(name, notIdle);
    });
    notIdle();
}
