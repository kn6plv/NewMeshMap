const out = {
    date: Date.now(),
    nodeInfo: []
};

const pending = [ "localnode" ];
const found = {};

async function readNode(name) {
    return new Promise(async resolve => {
        try {
            const res = await fetch(`http://${name}.local.mesh/cgi-bin/sysinfo.json?link_info=1&lqm=1`);
            resolve(await res.json());
            return;
        }
        catch (_) {
        }
        resolve(null);
    });
}

async function walkOne() {
    return new Promise(async resolve => {
        const name = pending.shift();
        if (name) {
            const node = await readNode(name);
            if (node) {
                if (name !== "localnode" && node.lat && node.lon) {
                    const d = node.node_details;
                    const m = node.meshrf;
                    const link_info = {};
                    for (k in node.link_info) {
                        const l = node.link_info[k];
                        link_info[k] = {
                            hostname: l.hostname,
                            linkType: l.linkType,
                            signal: l.signal,
                            noise: l.noise
                        }
                    }
                    out.nodeInfo.push({
                        data: {
                            node: node.node,
                            lat: parseFloat(node.lat),
                            lon: parseFloat(node.lon),
                            grid_square: node.grid_square,
                            api_version: node.api_version,
                            lastseen: Math.floor(Date.now() / 1000),
                            node_details: {
                                description: d.description,
                                hardware: d.hardware,
                                firmware_version: d.firmware_version,
                                mesh_supernode: d.mesh_supernode
                            },
                            meshrf: {
                                status: m.status,
                                ssid: m.ssid,
                                channel: m.channel,
                                freq: m.freq,
                                chanbw: m.chanbw,
                                height: m.height,
                                azimuth: m.azimuth,
                                elevation: m.elevation,
                                antenna: m.antenna ? { description : m.antenna.description } : undefined
                            },
                            interfaces: [
                                { mac: node.interfaces.find(i => i.mac ).mac }
                            ],
                            link_info: link_info
                        }
                    });
                }
                if (!node.node_details.mesh_supernode) {
                    Object.values(node.link_info || {}).forEach(l => {
                        const hostname = canonicalHostname(l.hostname);
                        if (!found[hostname]) {
                            found[hostname] = true;
                            pending.push(hostname);
                        }
                    });
                }
            }
        }
        resolve();
    });
}

function walk(update) {
    let running = 0;
    let count = 0;
    function run() {
        while (running < pending.length && running < 32) {
            running++;
            walkOne().then(() => {
                running--;
                if (++count % 8 === 0) {
                    update();
                }
                run();
            });
        }
        if (running === 0) {
            update();
        }
    }
    run();
}
