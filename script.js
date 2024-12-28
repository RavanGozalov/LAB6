let satellites = new Map();
let position = null;

const layout = {
    xaxis: {
        range: [-100, 100],
        title: 'X (км)'
    },
    yaxis: {
        range: [-100, 100],
        title: 'Y (км)'
    }
};

Plotly.newPlot('gpsPlot', [], layout);

let socket = new WebSocket('ws://localhost:4001');

socket.onmessage = (event) => {const STATIONS = [
    { x: 0, y: 0 },
    { x: 100000, y: 0 },
    { x: 0, y: 100000 }
];

let ws = new WebSocket('ws://localhost:4002');
let receivedTimes = {};
const LIGHT_SPEED = 3e8 / 1e9;

const layout = {
    xaxis: {
        range: [-10000, 110000],
        title: 'X (м)'
    },
    yaxis: {
        range: [-10000, 110000],
        title: 'Y (м)'
    }
};

const stations = {
    x: STATIONS.map(s => s.x),
    y: STATIONS.map(s => s.y),
    mode: 'markers',
    name: 'Станції',
    type: 'scatter',
    marker: { size: 10 }
};

const object = {
    x: [null],
    y: [null],
    mode: 'markers',
    name: 'Об\'єкт',
    type: 'scatter',
    marker: { size: 10 }
};

Plotly.newPlot('loranPlot', [stations, object], layout);

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    receivedTimes[data.sourceId] = data.receivedAt;
    
    if (Object.keys(receivedTimes).length === 3) {
        const position = calculatePosition();
        if (position) {
            Plotly.update('loranPlot', {
                x: [[position.x]],
                y: [[position.y]]
            }, {}, [1]);
        }
        receivedTimes = {};
    }
};

function calculatePosition() {
    const times = receivedTimes;
    const t1 = times['source1'];
    const t2 = times['source2'];
    const t3 = times['source3'];
    
    const delta_t12 = ((t1 - t2) / 1000) * 1e8;
    const delta_t13 = ((t1 - t3) / 1000) * 1e8;

    // Метод наименьших квадратов
    return leastSquares([50000, 50000], STATIONS[0], STATIONS[1], STATIONS[2], delta_t12, delta_t13);
}

function leastSquares(initial, s1, s2, s3, delta_t12, delta_t13) {
    let [x, y] = initial;
    const iterations = 100;
    const learningRate = 0.01;

    for (let i = 0; i < iterations; i++) {
        const d1 = Math.sqrt((x - s1.x)**2 + (y - s1.y)**2);
        const d2 = Math.sqrt((x - s2.x)**2 + (y - s2.y)**2);
        const d3 = Math.sqrt((x - s3.x)**2 + (y - s3.y)**2);

        const calc_t12 = (d1 - d2) / LIGHT_SPEED;
        const calc_t13 = (d1 - d3) / LIGHT_SPEED;

        const error_t12 = calc_t12 - delta_t12;
        const error_t13 = calc_t13 - delta_t13;

        // Градиентный спуск
        x -= learningRate * (error_t12 + error_t13) * (x - s1.x) / d1;
        y -= learningRate * (error_t12 + error_t13) * (y - s1.y) / d1;
    }

    return { x, y };
}

function updateSpeed() {
    const speed = parseInt(document.getElementById('speed').value);
    fetch('http://localhost:4002/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ objectSpeed: speed })
    });
}

ws.onclose = () => {
    setTimeout(() => {
        ws = new WebSocket('ws://localhost:4002');
    }, 1000);
};
    const data = JSON.parse(event.data);
    
    satellites.set(data.id, {
        x: data.x,
        y: data.y,
        sentAt: data.sentAt,
        receivedAt: data.receivedAt,
        lastUpdate: Date.now()
    });

    // Очищаем старые данные
    const now = Date.now();
    for (let [id, sat] of satellites.entries()) {
        if (now - sat.lastUpdate > 5000) {
            satellites.delete(id);
        }
    }

    if (satellites.size >= 3) {
        position = calculatePosition();
    }

    updatePlot();
};

function calculatePosition() {
    if (satellites.size < 3) return null;

    const sats = Array.from(satellites.values());
    const [p1, p2, p3] = sats.slice(0, 3);

    // Расчет расстояний
    const r1 = calculateDistance(p1);
    const r2 = calculateDistance(p2);
    const r3 = calculateDistance(p3);

    // Трилатерация
    const A = 2 * p2.x - 2 * p1.x;
    const B = 2 * p2.y - 2 * p1.y;
    const C = r1 * r1 - r2 * r2 - p1.x * p1.x + p2.x * p2.x - p1.y * p1.y + p2.y * p2.y;
    const D = 2 * p3.x - 2 * p2.x;
    const E = 2 * p3.y - 2 * p2.y;
    const F = r2 * r2 - r3 * r3 - p2.x * p2.x + p3.x * p3.x - p2.y * p2.y + p3.y * p3.y;

    const x = (C * E - F * B) / (E * A - B * D);
    const y = (C * D - A * F) / (B * D - A * E);

    return { x, y };
}

function calculateDistance(satellite) {
    const SPEED_OF_LIGHT = 299792.458;
    const timeOfFlight = (satellite.receivedAt - satellite.sentAt) / 1000;
    return timeOfFlight * SPEED_OF_LIGHT;
}

function updatePlot() {
    const data = [
        {
            x: Array.from(satellites.values()).map(s => s.x),
            y: Array.from(satellites.values()).map(s => s.y),
            mode: 'markers',
            type: 'scatter',
            name: 'Супутники',
            marker: { size: 10 }
        }
    ];

    if (position) {
        data.push({
            x: [position.x],
            y: [position.y],
            mode: 'markers',
            type: 'scatter',
            name: 'Об\'єкт',
            marker: { size: 12 }
        });
    }

    Plotly.react('gpsPlot', data, layout);
}

function updateConfig() {
    const config = {
        messageFrequency: parseInt(document.getElementById('freq').value),
        satelliteSpeed: parseInt(document.getElementById('satSpeed').value),
        objectSpeed: parseInt(document.getElementById('objSpeed').value)
    };

    fetch('http://localhost:4001/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
    });
}

socket.onclose = () => {
    setTimeout(() => {
        socket = new WebSocket('ws://localhost:4001');
    }, 1000);
};