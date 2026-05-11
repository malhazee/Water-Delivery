let map;
let geocoder;
let autocomplete;
let zoneRectangle = null;
let selectedZone = null;
let db = null;
let currentZones = [];
let editingZoneId = null;
let zonesUnsubscribe = null;
let manualDrawMode = false;
let manualDrawStart = null;
let manualDrawStartMarker = null;

const zonesCollectionName = 'zones';
const defaultCenter = { lat: 31.95, lng: 35.91 };

function initMap() {
    map = new google.maps.Map(document.getElementById('map'), {
        center: defaultCenter,
        zoom: 12,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        fullscreenControl: true,
        streetViewControl: false
    });

    geocoder = new google.maps.Geocoder();
    autocomplete = new google.maps.places.Autocomplete(document.getElementById('locationInput'), {
        componentRestrictions: { country: 'jo' },
        fields: ['formatted_address', 'geometry', 'name']
    });

    autocomplete.addListener('place_changed', function() {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
            searchLocation(document.getElementById('locationInput').value);
            return;
        }

        const name = place.formatted_address || place.name || document.getElementById('locationInput').value;
        placeZoneAt(place.geometry.location, name);
        map.setCenter(place.geometry.location);
        map.setZoom(14);
        setSearchStatus('"' + name + '" selected.', 'success');
    });

    map.addListener('click', function(event) {
        handleMapClick(event.latLng);
    });

    placeZoneAt(new google.maps.LatLng(defaultCenter.lat, defaultCenter.lng), 'Amman default zone');
}

function handleMapClick(latLng) {
    if (!manualDrawMode) {
        placeZoneAt(latLng, 'Manual map selection');
        return;
    }

    if (!manualDrawStart) {
        manualDrawStart = {
            lat: latLng.lat(),
            lng: latLng.lng()
        };
        setManualDrawStartMarker(latLng);
        setSearchStatus('First corner selected. Click the opposite corner to finish the square.', 'success');
        setZoneSummaryText('Manual draw mode: click the opposite corner to create the square zone.');
        return;
    }

    finishManualSquare(latLng);
}

function initializeFirebase() {
    if (!window.firebase || !firebase.apps || firebase.apps.length === 0 || !firebase.firestore) {
        setFirebaseStatus('Firestore is not loaded. Open this page through Firebase Hosting or the Firebase emulator.', 'error');
        return;
    }

    db = firebase.firestore();
    startZonesRealtimeListener();
}

function searchLocation(locationName) {
    if (!locationName.trim()) {
        setSearchStatus('Please enter an area name.', 'error');
        return;
    }

    document.getElementById('searchBtn').disabled = true;
    setSearchStatus('Searching for "' + locationName + '"...');

    geocoder.geocode({
        address: locationName,
        componentRestrictions: { country: 'JO' }
    }, function(results, status) {
        document.getElementById('searchBtn').disabled = false;

        if (status !== google.maps.GeocoderStatus.OK || !results || results.length === 0) {
            setSearchStatus('Area not found. Try another name or click the map.', 'error');
            return;
        }

        const result = results[0];
        const name = result.formatted_address || locationName;
        placeZoneAt(result.geometry.location, name);
        map.setCenter(result.geometry.location);
        map.setZoom(14);
        setSearchStatus('"' + name + '" selected.', 'success');
    });
}

function placeZoneAt(centerLatLng, label) {
    const center = {
        lat: centerLatLng.lat(),
        lng: centerLatLng.lng()
    };
    const sideKm = getSideKm();
    const bounds = buildSquareBounds(center, sideKm);

    if (!zoneRectangle) {
        zoneRectangle = new google.maps.Rectangle({
            map,
            bounds,
            draggable: true,
            editable: false,
            fillColor: '#2563eb',
            fillOpacity: 0.22,
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.95,
            strokeWeight: 2
        });

        zoneRectangle.addListener('dragend', syncZoneFromRectangle);
        zoneRectangle.addListener('bounds_changed', syncZoneFromRectangle);
    } else {
        zoneRectangle.setBounds(bounds);
    }

    selectedZone = {
        label,
        center,
        sideKm,
        bounds: normalizeBounds(bounds),
        corners: getCornersFromBounds(bounds)
    };
    updateZoneSummary();
}

function finishManualSquare(endLatLng) {
    const end = {
        lat: endLatLng.lat(),
        lng: endLatLng.lng()
    };
    const square = buildSquareFromCorners(manualDrawStart, end);

    setZoneSizeInputs(square.sideKm);
    applyZoneBounds(square.center, square.bounds, square.sideKm, 'Manual square zone');
    stopManualDrawMode();
    setSearchStatus('Manual square zone selected.', 'success');
}

function applyZoneBounds(center, bounds, sideKm, label) {
    if (!zoneRectangle) {
        zoneRectangle = new google.maps.Rectangle({
            map,
            bounds,
            draggable: true,
            editable: false,
            fillColor: '#2563eb',
            fillOpacity: 0.22,
            strokeColor: '#1d4ed8',
            strokeOpacity: 0.95,
            strokeWeight: 2
        });

        zoneRectangle.addListener('dragend', syncZoneFromRectangle);
        zoneRectangle.addListener('bounds_changed', syncZoneFromRectangle);
    } else {
        zoneRectangle.setBounds(bounds);
    }

    selectedZone = {
        label,
        center,
        sideKm,
        bounds: normalizeBounds(bounds),
        corners: getCornersFromBounds(bounds)
    };
    updateZoneSummary();
}

function updateSquareSize() {
    if (!selectedZone) {
        return;
    }

    const sideKm = getSideKm();
    const bounds = buildSquareBounds(selectedZone.center, sideKm);
    zoneRectangle.setBounds(bounds);
    selectedZone.sideKm = sideKm;
    selectedZone.bounds = normalizeBounds(bounds);
    selectedZone.corners = getCornersFromBounds(bounds);
    updateZoneSummary();
}

function syncZoneFromRectangle() {
    if (!zoneRectangle || !selectedZone) {
        return;
    }

    const bounds = zoneRectangle.getBounds();
    if (!bounds) {
        return;
    }

    const center = bounds.getCenter();
    selectedZone.center = {
        lat: center.lat(),
        lng: center.lng()
    };
    selectedZone.bounds = normalizeBounds(bounds);
    selectedZone.corners = getCornersFromBounds(bounds);
    updateZoneSummary();
}

function buildSquareBounds(center, sideKm) {
    const halfLat = (sideKm / 2) / 110.574;
    const latRadians = center.lat * Math.PI / 180;
    const kmPerLngDegree = Math.max(111.32 * Math.cos(latRadians), 0.01);
    const halfLng = (sideKm / 2) / kmPerLngDegree;

    return {
        north: center.lat + halfLat,
        south: center.lat - halfLat,
        east: center.lng + halfLng,
        west: center.lng - halfLng
    };
}

function buildSquareFromCorners(start, end) {
    const latDirection = end.lat >= start.lat ? 1 : -1;
    const lngDirection = end.lng >= start.lng ? 1 : -1;
    const latKm = Math.abs(end.lat - start.lat) * 110.574;
    const avgLat = (start.lat + end.lat) / 2;
    const kmPerLngDegree = Math.max(111.32 * Math.cos(avgLat * Math.PI / 180), 0.01);
    const lngKm = Math.abs(end.lng - start.lng) * kmPerLngDegree;
    const sideKm = Math.min(Math.max(Math.max(latKm, lngKm), 0.25), 10);
    const latDelta = sideKm / 110.574;
    const lngDelta = sideKm / kmPerLngDegree;
    const south = latDirection > 0 ? start.lat : start.lat - latDelta;
    const north = latDirection > 0 ? start.lat + latDelta : start.lat;
    const west = lngDirection > 0 ? start.lng : start.lng - lngDelta;
    const east = lngDirection > 0 ? start.lng + lngDelta : start.lng;
    const bounds = { north, south, east, west };

    return {
        bounds,
        sideKm,
        center: {
            lat: (north + south) / 2,
            lng: (east + west) / 2
        }
    };
}

function normalizeBounds(bounds) {
    const northEast = typeof bounds.getNorthEast === 'function' ? bounds.getNorthEast() : null;
    const southWest = typeof bounds.getSouthWest === 'function' ? bounds.getSouthWest() : null;

    if (northEast && southWest) {
        return {
            north: northEast.lat(),
            east: northEast.lng(),
            south: southWest.lat(),
            west: southWest.lng()
        };
    }

    return {
        north: Number(bounds.north),
        east: Number(bounds.east),
        south: Number(bounds.south),
        west: Number(bounds.west)
    };
}

function getCornersFromBounds(bounds) {
    const normalized = normalizeBounds(bounds);
    return [
        { lat: normalized.north, lng: normalized.west },
        { lat: normalized.north, lng: normalized.east },
        { lat: normalized.south, lng: normalized.east },
        { lat: normalized.south, lng: normalized.west }
    ];
}

function getSideKm() {
    const value = Number(document.getElementById('zoneSizeNumber').value);
    if (!Number.isFinite(value)) {
        return 2;
    }

    return Math.min(Math.max(value, 0.25), 10);
}

function getZoneFormData() {
    if (!selectedZone) {
        return null;
    }

    return {
        name: document.getElementById('zoneName').value.trim(),
        type: 'square',
        source: 'admin-map',
        label: selectedZone.label,
        center: selectedZone.center,
        centerGeoPoint: new firebase.firestore.GeoPoint(selectedZone.center.lat, selectedZone.center.lng),
        bounds: selectedZone.bounds,
        corners: selectedZone.corners,
        sideKm: selectedZone.sideKm,
        mapsUrl: buildMapsUrl(selectedZone.center.lat, selectedZone.center.lng),
        active: true
    };
}

async function saveZoneToFirebase() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const zone = getZoneFormData();
    if (!zone || !zone.center || !zone.bounds) {
        setFirebaseStatus('Please choose a square zone on the map first.', 'error');
        return;
    }

    if (!zone.name) {
        setFirebaseStatus('Please enter the zone name.', 'error');
        return;
    }

    const saveBtn = document.getElementById('saveZoneBtn');
    saveBtn.disabled = true;
    setFirebaseStatus('Saving zone to Firestore...');

    try {
        if (editingZoneId) {
            await db.collection(zonesCollectionName).doc(editingZoneId).update({
                ...zone,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Zone updated in Firestore.', 'success');
        } else {
            await db.collection(zonesCollectionName).add({
                ...zone,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            setFirebaseStatus('Zone saved to Firestore.', 'success');
        }

        clearZoneForm();
    } catch (error) {
        console.error('Error saving zone:', error);
        setFirebaseStatus('Could not save zone: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
    }
}

function startZonesRealtimeListener() {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const loadBtn = document.getElementById('loadZonesBtn');
    loadBtn.disabled = true;
    setFirebaseStatus('Listening for Firestore zone updates...');

    try {
        if (zonesUnsubscribe) {
            zonesUnsubscribe();
        }

        zonesUnsubscribe = db.collection(zonesCollectionName).orderBy('createdAt', 'desc').onSnapshot((snapshot) => {
            currentZones = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            renderZones(currentZones);
            setFirebaseStatus('Zones are live from Firestore.', 'success');
            loadBtn.disabled = false;
        }, (error) => {
            console.error('Error listening to zones:', error);
            setFirebaseStatus('Could not listen to Firestore zones: ' + error.message, 'error');
            loadBtn.disabled = false;
        });
    } catch (error) {
        console.error('Error starting zone listener:', error);
        setFirebaseStatus('Could not start zone updates: ' + error.message, 'error');
        loadBtn.disabled = false;
    }
}

function renderZones(zones) {
    const tableBody = document.getElementById('zonesTableBody');

    if (zones.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No zones saved yet.</td></tr>';
        return;
    }

    tableBody.innerHTML = zones.map((zone) => {
        const center = resolvePoint(zone.center);
        const bounds = resolveBounds(zone.bounds);
        const centerText = center ? formatPoint(center) : 'No center saved';
        const boundsText = bounds ? formatBounds(bounds) : 'No bounds saved';
        const mapsUrl = zone.mapsUrl || (center ? buildMapsUrl(center.lat, center.lng) : '');

        return `
            <tr>
                <td>${escapeHtml(zone.name || '')}</td>
                <td>
                    ${escapeHtml(centerText)}
                    ${mapsUrl ? `<br><a class="map-link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer">Open Map</a>` : ''}
                </td>
                <td>${escapeHtml(String(zone.sideKm || ''))} km</td>
                <td>${escapeHtml(boundsText)}</td>
                <td>
                    <div class="row-actions">
                        <button type="button" class="btn btn-small btn-edit" data-action="edit" data-id="${escapeHtml(zone.id)}">Edit</button>
                        <button type="button" class="btn btn-small btn-delete" data-action="delete" data-id="${escapeHtml(zone.id)}">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function startEditZone(zoneId) {
    const zone = currentZones.find((item) => item.id === zoneId);

    if (!zone) {
        setFirebaseStatus('Could not find zone to edit.', 'error');
        return;
    }

    const center = resolvePoint(zone.center);
    const bounds = resolveBounds(zone.bounds);

    if (!center || !bounds) {
        setFirebaseStatus('This zone does not have map data to edit.', 'error');
        return;
    }

    document.getElementById('zoneName').value = zone.name || '';
    setZoneSizeInputs(Number(zone.sideKm) || 2);
    selectedZone = {
        label: zone.label || zone.name || 'Saved zone',
        center,
        sideKm: Number(zone.sideKm) || 2,
        bounds,
        corners: Array.isArray(zone.corners) ? zone.corners : getCornersFromBounds(bounds)
    };

    if (!zoneRectangle) {
        placeZoneAt(new google.maps.LatLng(center.lat, center.lng), selectedZone.label);
    }

    zoneRectangle.setBounds(bounds);
    map.fitBounds(bounds);
    editingZoneId = zoneId;
    document.getElementById('saveZoneBtn').textContent = 'Update Zone';
    document.getElementById('cancelEditBtn').hidden = false;
    updateZoneSummary();
    setFirebaseStatus('Editing zone. Move the square or change its side length, then update.', 'success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteZone(zoneId) {
    if (!db) {
        initializeFirebase();
    }

    if (!db) {
        return;
    }

    const zone = currentZones.find((item) => item.id === zoneId);
    const zoneName = zone && zone.name ? zone.name : 'this zone';

    if (!confirm('Delete ' + zoneName + '?')) {
        return;
    }

    setFirebaseStatus('Deleting zone...');

    try {
        await db.collection(zonesCollectionName).doc(zoneId).delete();
        if (editingZoneId === zoneId) {
            clearZoneForm();
        }
        setFirebaseStatus('Zone deleted.', 'success');
    } catch (error) {
        console.error('Error deleting zone:', error);
        setFirebaseStatus('Could not delete zone: ' + error.message, 'error');
    }
}

function clearZoneForm() {
    document.getElementById('zoneName').value = '';
    editingZoneId = null;
    document.getElementById('saveZoneBtn').textContent = 'Save Zone to Firestore';
    document.getElementById('cancelEditBtn').hidden = true;
    selectedZone = null;

    if (zoneRectangle) {
        zoneRectangle.setMap(null);
        zoneRectangle = null;
    }

    stopManualDrawMode();
    setZoneSummaryText('Click the map or search for a place to position the square zone.');
}

function startManualDrawMode() {
    manualDrawMode = true;
    manualDrawStart = null;
    clearManualDrawStartMarker();
    document.getElementById('manualDrawBtn').textContent = 'Cancel Manual Draw';
    setSearchStatus('Manual draw mode: click the first corner of the square.', 'success');
    setZoneSummaryText('Manual draw mode: click the first corner, then click the opposite corner.');
}

function stopManualDrawMode() {
    manualDrawMode = false;
    manualDrawStart = null;
    clearManualDrawStartMarker();
    document.getElementById('manualDrawBtn').textContent = 'Draw Square Manually';
}

function toggleManualDrawMode() {
    if (manualDrawMode) {
        stopManualDrawMode();
        setSearchStatus('Manual draw cancelled.');
        updateZoneSummary();
        return;
    }

    startManualDrawMode();
}

function setManualDrawStartMarker(latLng) {
    clearManualDrawStartMarker();
    manualDrawStartMarker = new google.maps.Marker({
        map,
        position: latLng,
        title: 'First square corner'
    });
}

function clearManualDrawStartMarker() {
    if (manualDrawStartMarker) {
        manualDrawStartMarker.setMap(null);
        manualDrawStartMarker = null;
    }
}

function setZoneSummaryText(message) {
    document.getElementById('zoneSummary').textContent = message;
}

function updateZoneSummary() {
    const summary = document.getElementById('zoneSummary');

    if (!selectedZone) {
        summary.textContent = 'Click the map or search for a place to position the square zone.';
        return;
    }

    summary.innerHTML = `
        <strong>${escapeHtml(selectedZone.label)}</strong><br>
        Center: ${selectedZone.center.lat.toFixed(6)}, ${selectedZone.center.lng.toFixed(6)}<br>
        Square side: ${selectedZone.sideKm.toFixed(2)} km<br>
        North: ${selectedZone.bounds.north.toFixed(6)}, South: ${selectedZone.bounds.south.toFixed(6)}<br>
        East: ${selectedZone.bounds.east.toFixed(6)}, West: ${selectedZone.bounds.west.toFixed(6)}
    `;
}

function setZoneSizeInputs(value) {
    const normalized = Math.min(Math.max(Number(value) || 2, 0.25), 10);
    document.getElementById('zoneSize').value = normalized;
    document.getElementById('zoneSizeNumber').value = normalized;
}

function resolvePoint(point) {
    if (!point) {
        return null;
    }

    const lat = Number(point.lat ?? point.latitude ?? point._lat);
    const lng = Number(point.lng ?? point.longitude ?? point._long);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return { lat, lng };
}

function resolveBounds(bounds) {
    if (!bounds) {
        return null;
    }

    const normalized = {
        north: Number(bounds.north),
        east: Number(bounds.east),
        south: Number(bounds.south),
        west: Number(bounds.west)
    };

    if (Object.values(normalized).some((value) => !Number.isFinite(value))) {
        return null;
    }

    return normalized;
}

function formatPoint(point) {
    return point.lat.toFixed(6) + ', ' + point.lng.toFixed(6);
}

function formatBounds(bounds) {
    return 'N ' + bounds.north.toFixed(5) + ', S ' + bounds.south.toFixed(5) + ', E ' + bounds.east.toFixed(5) + ', W ' + bounds.west.toFixed(5);
}

function buildMapsUrl(lat, lng) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function setSearchStatus(message, type = '') {
    const statusEl = document.getElementById('searchStatus');
    statusEl.textContent = message;
    statusEl.className = type ? 'inline-status ' + type : 'inline-status';
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

document.getElementById('searchBtn').addEventListener('click', function() {
    searchLocation(document.getElementById('locationInput').value);
});
document.getElementById('locationInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        searchLocation(event.target.value);
    }
});
document.getElementById('zoneSize').addEventListener('input', function(event) {
    setZoneSizeInputs(event.target.value);
    updateSquareSize();
});
document.getElementById('zoneSizeNumber').addEventListener('input', function(event) {
    setZoneSizeInputs(event.target.value);
    updateSquareSize();
});
document.getElementById('saveZoneBtn').addEventListener('click', saveZoneToFirebase);
document.getElementById('clearZoneBtn').addEventListener('click', clearZoneForm);
document.getElementById('loadZonesBtn').addEventListener('click', startZonesRealtimeListener);
document.getElementById('manualDrawBtn').addEventListener('click', toggleManualDrawMode);
document.getElementById('cancelEditBtn').addEventListener('click', function() {
    clearZoneForm();
    setFirebaseStatus('Edit cancelled.');
});
document.getElementById('zonesTableBody').addEventListener('click', function(event) {
    const button = event.target.closest('button[data-action]');
    if (!button) {
        return;
    }

    if (button.dataset.action === 'edit') {
        startEditZone(button.dataset.id);
    } else if (button.dataset.action === 'delete') {
        deleteZone(button.dataset.id);
    }
});

window.addEventListener('load', function() {
    initMap();
    initializeFirebase();
});
