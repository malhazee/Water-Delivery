// Initialize map and variables
let map;
let geocoder;
let autocomplete;
let stationMarker = null;
let selectedLocation = null;

// Initialize Google Map
function initMap() {
    // Default location: Jordan
    const defaultLocation = { lat: 31.5, lng: 35.8 };

    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 7,
        center: defaultLocation,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        fullscreenControl: true,
        streetViewControl: true
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

        const selectedName = place.formatted_address || place.name || document.getElementById('locationInput').value;
        chooseStationLocation(place.geometry.location, selectedName);
        map.setCenter(place.geometry.location);
        map.setZoom(16);
        updateSearchStatus('"' + selectedName + '" selected on the map.', 'success');
    });

    map.addListener('click', function(event) {
        chooseStationLocation(event.latLng, 'Manual selected location');
    });

    updateStatus('Click the map to choose the station manually, or search for it above.');
}

// Search for a station or location using Google Geocoding API
function searchLocation(locationName) {
    if (!locationName.trim()) {
        updateSearchStatus('Please enter a station or location name', 'error');
        return;
    }

    updateSearchStatus('Searching for "' + locationName + '"...', 'info');
    document.getElementById('searchBtn').disabled = true;

    geocoder.geocode({
        address: locationName,
        componentRestrictions: { country: 'JO' }
    }, function(results, status) {
        document.getElementById('searchBtn').disabled = false;

        if (status !== google.maps.GeocoderStatus.OK) {
            console.error('Geocoding error:', status);
            if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
                updateSearchStatus('Station or location "' + locationName + '" not found in Jordan. Try another name or click the map manually.', 'error');
            } else if (status === google.maps.GeocoderStatus.OVER_QUERY_LIMIT) {
                updateSearchStatus('Search limit reached. Please try again in a moment.', 'error');
            } else if (status === google.maps.GeocoderStatus.REQUEST_DENIED) {
                updateSearchStatus('Search service unavailable. Check API key.', 'error');
            } else {
                updateSearchStatus('Search failed: ' + status, 'error');
            }
            return;
        }

        if (!results || results.length === 0) {
            updateSearchStatus('Station or location "' + locationName + '" not found in Jordan. Try another name or click the map manually.', 'error');
            return;
        }

        const result = results[0];
        const location = result.geometry.location;
        const selectedName = result.formatted_address || locationName;

        chooseStationLocation(location, selectedName);
        map.setCenter(location);
        map.setZoom(16);
        updateSearchStatus('"' + selectedName + '" selected on the map.', 'success');
    });
}

// Choose a station location from search result, manual map click, or marker drag.
function chooseStationLocation(location, locationName) {
    selectedLocation = {
        lat: location.lat(),
        lng: location.lng()
    };

    if (!stationMarker) {
        stationMarker = new google.maps.Marker({
            map: map,
            draggable: true,
            title: 'Station Location'
        });

        stationMarker.addListener('dragend', function(event) {
            const currentName = document.getElementById('locationNameInput').value.trim();
            chooseStationLocation(event.latLng, currentName || 'Manual selected location');
        });
    }

    stationMarker.setPosition(location);
    document.getElementById('locationNameInput').value = locationName;
    updateStatus('Station location selected. Click "Save Location" to confirm.', 'success');
}

// Get selected station location coordinate
function getStationLocationCoordinates() {
    return selectedLocation ? [selectedLocation] : [];
}

// Save station location and send to parent
function saveStationLocation() {
    const locationName = document.getElementById('locationNameInput').value.trim();
    const coordinates = getStationLocationCoordinates();

    if (!locationName) {
        updateStatus('Please enter a station location name!', 'error');
        return;
    }

    if (coordinates.length === 0) {
        updateStatus('Please search for a station or click the map first!', 'error');
        return;
    }

    const locationData = {
        type: 'stationLocationSelected',
        locationName: locationName,
        coordinates: coordinates,
        timestamp: new Date().toISOString()
    };

    window.parent.postMessage(locationData, '*');
    updateStatus('Location "' + locationName + '" saved and sent!', 'success');
}

// Clear selected station location
function clearSelectedLocation() {
    if (stationMarker) {
        stationMarker.setMap(null);
        stationMarker = null;
    }

    selectedLocation = null;
    document.getElementById('locationNameInput').value = '';
}

// Clear button handler
function clearLocation() {
    clearSelectedLocation();
    updateSearchStatus('', 'info');
    updateStatus('Location cleared.');
}

// Cancel action
function cancelAction() {
    window.parent.postMessage({
        type: 'stationLocationCancelled',
        timestamp: new Date().toISOString()
    }, '*');
}

// Update status messages
function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = 'status ' + type;
}

function updateSearchStatus(message, type = 'info') {
    const statusEl = document.getElementById('searchStatus');
    statusEl.textContent = message;
    statusEl.className = message ? 'search-status ' + type : 'search-status';
}

// Event listeners
document.getElementById('searchBtn').addEventListener('click', function() {
    const locationName = document.getElementById('locationInput').value;
    searchLocation(locationName);
});

// Search on Enter key
document.getElementById('locationInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        searchLocation(this.value);
    }
});

document.getElementById('saveBtn').addEventListener('click', saveStationLocation);
document.getElementById('clearBtn').addEventListener('click', clearLocation);
document.getElementById('cancelBtn').addEventListener('click', cancelAction);

// Initialize map when page loads
window.addEventListener('load', initMap);
