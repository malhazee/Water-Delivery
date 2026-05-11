// Handle messages from the Choose Location iframe
let selectedStationLocation = null;
let db = null;
let currentStations = [];
let editingStationId = null;
let stationsUnsubscribe = null;

function initializeFirebase() {
    if (!window.firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.firestore) {
        setFirebaseStatus('Firebase is not loaded. Open this page through Firebase Hosting or the Firebase emulator.', 'error');
        return;
    }

    db = firebase.firestore();
    startStationsRealtimeListener();
}

window.addEventListener('message', function(event) {
    // Validate the origin for security (optional but recommended)
    // if (event.origin !== window.location.origin) return;

    const data = event.data;

    if (data.type === 'stationLocationSelected') {
        // Station location was successfully selected
        console.log('Station location name received:', data.locationName);
        console.log('Station location coordinates received:', data.coordinates);
        
        // Display the coordinates and station location name
        displayStationLocationCoordinates(data.coordinates, data.locationName);
        
        // Store the coordinates and station location name in data attributes for later use
        document.getElementById('areaCoordinates').dataset.coordinates = JSON.stringify(data.coordinates);
        document.getElementById('areaCoordinates').dataset.locationName = data.locationName;
        selectedStationLocation = {
            name: data.locationName,
            coordinates: data.coordinates
        };
        
        // You can also auto-fill the location field
        console.log('Station location saved at:', data.timestamp);
    } 
    else if (data.type === 'stationLocationCancelled') {
        console.log('Station location selection cancelled');
        // Clear any existing coordinates display
        document.getElementById('areaCoordinates').style.display = 'none';
    }
});

// Function to display coordinates and station location name on the page
function displayStationLocationCoordinates(coordinates, locationName = '') {
    const coordDisplay = document.getElementById('areaCoordinates');
    const coordList = document.getElementById('coordinatesList');
    const selectedPoint = coordinates[0];
    
    let html = '<strong>' + (locationName ? 'Location: ' + locationName : 'Coordinates') + '</strong><br>';
    if (selectedPoint) {
        html += `Latitude: ${selectedPoint.lat.toFixed(6)}<br>`;
        html += `Longitude: ${selectedPoint.lng.toFixed(6)}<br>`;
    }
    
    coordList.innerHTML = html;
    coordDisplay.style.display = 'block';
}

// Optional: Function to get the stored station location coordinates when needed
function getStationLocationCoordinates() {
    const coordData = document.getElementById('areaCoordinates').dataset.coordinates;
    if (coordData) {
        return JSON.parse(coordData);
    }
    return null;
}

// Optional: Function to get the station location name
function getStationLocationName() {
    return document.getElementById('areaCoordinates').dataset.locationName || '';
}

function getStationFormData() {
    const coordinates = getStationLocationCoordinates();
    const location = coordinates && coordinates[0] ? coordinates[0] : null;

    return {
        name: document.getElementById('stationName').value.trim(),
        locationName: getStationLocationName(),
        location: location,
        mapsUrl: location ? buildMapsUrl(location.lat, location.lng) : '',
        phone: document.getElementById('stationPhone').value.trim(),
        openTime: document.getElementById('openTime').value,
        closeTime: document.getElementById('closeTime').value
    };
}

function validateStationData(station) {
    if (!station.name) {
        return 'Please enter the station name.';
    }

    if (!station.location) {
        return 'Please choose the station location from the map first.';
    }

    if (!station.phone) {
        return 'Please enter the phone number.';
    }

    if (!station.openTime || !station.closeTime) {
        return 'Please enter the open and close time.';
    }

    return '';
}

async function saveStationToFirebase() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const station = getStationFormData();
    const validationMessage = validateStationData(station);
    if (validationMessage) {
        setFirebaseStatus(validationMessage, 'error');
        return;
    }

    const saveBtn = document.getElementById('saveStationBtn');
    saveBtn.disabled = true;
    setFirebaseStatus('Saving station to Firebase...');

    try {
        if (editingStationId) {
            await db.collection('stations').doc(editingStationId).update({
                ...station,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Station updated in Firebase.', 'success');
        } else {
            await db.collection('stations').add({
                ...station,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Station saved to Firebase.', 'success');
        }

        clearStationForm();
    } catch (error) {
        console.error('Error saving station:', error);
        setFirebaseStatus('Could not save station: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function startStationsRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const loadBtn = document.getElementById('loadStationsBtn');
    loadBtn.disabled = true;
    setFirebaseStatus('Listening for Firebase station updates...');

    try {
        if (stationsUnsubscribe) {
            stationsUnsubscribe();
        }

        stationsUnsubscribe = db.collection('stations').orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentStations = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderStations(currentStations);
            setFirebaseStatus('Stations are live from Firebase.', 'success');
            loadBtn.disabled = false;
        }, (error) => {
            console.error('Error listening to stations:', error);
            setFirebaseStatus('Could not listen to stations: ' + error.message, 'error');
            loadBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting station listener:', error);
        setFirebaseStatus('Could not start station updates: ' + error.message, 'error');
        loadBtn.disabled = false;
    }
}

function renderStations(stations) {
    const tableBody = document.getElementById('stationsTableBody');

    if (stations.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6">No stations saved yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = stations.map((station) => {
        const locationCell = getLocationCellHtml(station);

        return `
            <tr>
                <td>${escapeHtml(station.name || '')}</td>
                <td>${locationCell}</td>
                <td>${escapeHtml(station.phone || '')}</td>
                <td>${escapeHtml(station.openTime || '')}</td>
                <td>${escapeHtml(station.closeTime || '')}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="btn btn-small btn-edit" data-action="edit" data-id="${escapeHtml(station.id)}">Edit</button>
                        <button type="button" class="btn btn-small btn-delete" data-action="delete" data-id="${escapeHtml(station.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function deleteStation(stationId) {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const station = currentStations.find((item) => item.id === stationId);
    const stationName = station && station.name ? station.name : 'this station';

    if (!confirm('Delete ' + stationName + '?')) {
        return;
    }

    setFirebaseStatus('Deleting station...');

    try {
        await db.collection('stations').doc(stationId).delete();
        if (editingStationId === stationId) {
            clearStationForm();
        }
        setFirebaseStatus('Station deleted.', 'success');
    } catch (error) {
        console.error('Error deleting station:', error);
        setFirebaseStatus('Could not delete station: ' + error.message, 'error');
    }
}

function startEditStation(stationId) {
    const station = currentStations.find((item) => item.id === stationId);

    if (!station) {
        setFirebaseStatus('Could not find station to edit.', 'error');
        return;
    }

    const location = resolveStationLocation(station);

    document.getElementById('stationName').value = station.name || '';
    document.getElementById('stationPhone').value = station.phone || '';
    document.getElementById('openTime').value = station.openTime || '';
    document.getElementById('closeTime').value = station.closeTime || '';

    if (location) {
        displayStationLocationCoordinates([location], station.locationName || 'Station location');
        document.getElementById('areaCoordinates').dataset.coordinates = JSON.stringify([location]);
        document.getElementById('areaCoordinates').dataset.locationName = station.locationName || 'Station location';
        selectedStationLocation = {
            name: station.locationName || 'Station location',
            coordinates: [location]
        };
    } else {
        document.getElementById('areaCoordinates').style.display = 'none';
        delete document.getElementById('areaCoordinates').dataset.coordinates;
        delete document.getElementById('areaCoordinates').dataset.locationName;
        selectedStationLocation = null;
    }

    editingStationId = stationId;
    document.getElementById('saveStationBtn').textContent = 'Update Station';
    document.getElementById('cancelEditBtn').hidden = false;
    setFirebaseStatus('Editing station. Change fields, choose a new map location if needed, then update.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function getLocationCellHtml(station) {
    const location = resolveStationLocation(station);
    const locationText = station.locationName || 'Open station location';

    if (!location && !station.mapsUrl) {
        return escapeHtml(locationText);
    }

    const mapsUrl = station.mapsUrl || buildMapsUrl(location.lat, location.lng);

    return `
        <div class="location-cell">
            <span>${escapeHtml(locationText)}</span>
            <a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="location-link">Open Map</a>
        </div>
    `;
}

function resolveStationLocation(station) {
    const candidates = [
        station.location,
        station.coordinates && station.coordinates[0],
        station.locationCoordinates && station.locationCoordinates[0]
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        const lat = Number(candidate.lat ?? candidate.latitude ?? candidate._lat);
        const lng = Number(candidate.lng ?? candidate.longitude ?? candidate._long);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return { lat, lng };
        }
    }

    return null;
}

function buildMapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function clearStationForm() {
    document.getElementById('stationName').value = '';
    document.getElementById('stationPhone').value = '';
    document.getElementById('openTime').value = '';
    document.getElementById('closeTime').value = '';
    document.getElementById('areaCoordinates').style.display = 'none';
    delete document.getElementById('areaCoordinates').dataset.coordinates;
    delete document.getElementById('areaCoordinates').dataset.locationName;
    selectedStationLocation = null;
    editingStationId = null;
    document.getElementById('saveStationBtn').textContent = 'Save Station to Firebase';
    document.getElementById('cancelEditBtn').hidden = true;
}

function setFirebaseStatus(message, type = '') {
    const statusEl = document.getElementById('firebaseStatus');
    statusEl.textContent = message;
    statusEl.className = type ? 'firebase-status ' + type : 'firebase-status';
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

document.getElementById('saveStationBtn').addEventListener('click', saveStationToFirebase);
document.getElementById('loadStationsBtn').addEventListener('click', startStationsRealtimeListener);
document.getElementById('cancelEditBtn').addEventListener('click', function() {
    clearStationForm();
    setFirebaseStatus('Edit cancelled.');
});
document.getElementById('stationsTableBody').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    if (button.dataset.action === 'edit') {
        startEditStation(button.dataset.id);
    } else if (button.dataset.action === 'delete') {
        deleteStation(button.dataset.id);
    }
});
window.addEventListener('load', initializeFirebase);
