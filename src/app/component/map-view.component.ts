import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet'; 
import 'leaflet/dist/leaflet.css';

// Define a structured type for our target locations
interface TargetLocation {
  name: string;
  latlng: [number, number];
  id: string;
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-container">
      
      <div id="map" class="map-canvas"></div>

      <div class="top-overlay-container">
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input 
            type="text" 
            placeholder="{{ isSearching ? 'Searching...' : 'Search for a location...' }}" 
            class="search-input" 
            #searchInput
            (keyup.enter)="searchAndFocus(searchInput.value)"
            [disabled]="isSearching"
          >
          <button 
            class="search-btn" 
            [disabled]="isSearching || !searchInput.value"
            (click)="searchAndFocus(searchInput.value)"
          >
              {{ isSearching ? '...' : 'Go' }}
          </button>
          <span class="user-icon" (click)="focusOnUser()">📍</span>
        </div>
        <p *ngIf="searchError" class="search-error-message">
            ⚠️ {{ searchError }}
        </p>
      </div>
      
      <div class="fab-container">
        <button class="location-fab" (click)="focusOnUser()" title="Center on My Location">
          <span class="fab-icon">🎯</span>
        </button>
      </div>

      <div 
        class="bottom-overlay-container" 
        [class.expanded]="isSheetExpanded"
      >
        <div class="sliding-sheet">
            <div class="drag-handle-area" (click)="toggleSheet()">
                <div class="drag-handle"></div>
                <h3 class="toggle-title">
                    <span class="status-icon">
                        {{ isSheetExpanded ? '▼' : '▲' }}
                    </span>
                    {{ isSheetExpanded ? 'Collapse' : 'Expand Locations & Info' }}
                </h3>
            </div>
            
            <div class="user-details-section">
                <h3 class="info-header">Your Current GPS Position</h3>
                <div *ngIf="userGeoHash">
                    <div class="data-row">
                        <span class="label">Latitude:</span>
                        <span class="value">{{ userLat?.toFixed(5) }}</span>
                    </div>
                    <div class="data-row">
                        <span class="label">Longitude:</span>
                        <span class="value">{{ userLng?.toFixed(5) }}</span>
                    </div>
                    <div class="data-row">
                        <span class="label">GeoHash (P8):</span>
                        <span class="value hash">{{ userGeoHash }}</span>
                    </div>
                    <div class="data-row">
                        <a [href]="getGoogleMapsLink(userLat, userLng)" target="_blank" class="gmaps-link">Open in Google Maps ↗</a>
                    </div>
                </div>

                <p *ngIf="!userGeoHash && !errorMessage" class="message loading-message">
                    <span class="spinner"></span> Locating user and initializing map...
                </p>
                <p *ngIf="errorMessage" class="message error-message">
                    ⚠️ {{ errorMessage }}
                </p>
            </div>
            
            <hr class="separator">

            <div class="location-list-section">
                <h3 class="info-header">Saved Destinations</h3>
                <div class="location-list">
                    <div *ngFor="let target of targets" class="list-item" (click)="focusOnTarget(target.latlng)">
                        <span class="icon">🗺️</span>
                        <div class="location-details">
                            <span class="location-name">{{ target.name }}</span>
                            <span class="location-coords">Lat: {{ target.latlng[0]?.toFixed(5) }}, Lng: {{ target.latlng[1]?.toFixed(5) }}</span>
                        </div>
                        <button class="focus-btn" (click)="$event.stopPropagation(); focusOnTarget(target.latlng)">
                            Focus
                        </button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
    .app-container {
      width: 100vw;
      height: 100vh;
      position: relative; 
      font-family: 'Roboto', sans-serif; 
      overflow: hidden;
    }
    
    #map { 
      width: 100%; 
      height: 100%; 
      position: absolute;
      z-index: 10;
    }

    .top-overlay-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        z-index: 20;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 10px;
    }
    .search-bar {
      width: 90vw;
      max-width: 550px;
      height: 50px;
      background-color: #ffffff;
      border-radius: 25px; 
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      padding: 0 10px 0 15px; 
      pointer-events: auto;
    }
    .search-input {
      flex-grow: 1;
      border: none;
      padding: 10px 10px;
      font-size: 1rem;
      color: #202124;
      background: none;
      outline: none;
    }
    .search-btn {
        background: #4285f4;
        color: white;
        border: none;
        padding: 8px 15px;
        border-radius: 20px;
        margin-left: 5px;
        cursor: pointer;
        transition: background-color 0.2s;
        font-weight: 500;
        pointer-events: auto;
    }
    .search-btn:disabled {
        background: #aab9d2;
        cursor: default;
    }
    .search-icon, .user-icon {
      font-size: 1.2rem;
      color: #70757a; 
      cursor: pointer; 
    }
    .search-error-message {
        background-color: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
        padding: 8px 15px;
        border-radius: 8px;
        margin-top: 5px;
        font-size: 0.9rem;
        width: 90vw;
        max-width: 550px;
        text-align: center;
        pointer-events: auto;
    }

    .fab-container {
      position: absolute;
      bottom: 150px; 
      right: 40px; 
      z-index: 30; 
      pointer-events: none; 
      width: auto;
      max-width: none;
    }
    .location-fab {
      pointer-events: auto;
      background-color: #ffffff;
      color: #1a73e8; 
      width: 56px;
      height: 56px; 
      border-radius: 50%;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
      cursor: pointer;
      font-size: 1.8rem; 
    }

    .bottom-overlay-container {
        position: absolute;
        bottom: 0; 
        left: 0;
        width: 100%;
        z-index: 20; 
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 0;
        pointer-events: none; 
        transform: translateY(calc(100% - 80px));
        transition: transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }
    
    .bottom-overlay-container.expanded {
        transform: translateY(-420px); 
    }

    .sliding-sheet {
        width: 95vw;
        max-width: 550px;
        background-color: #ffffff;
        border-radius: 12px 12px 0 0; 
        box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.2);
        padding: 0;
        pointer-events: auto; 
        max-height: 500px; 
        overflow-y: auto;
    }
    
    .drag-handle-area {
        padding: 10px 0 5px;
        text-align: center;
        cursor: pointer;
        user-select: none;
        position: sticky; 
        top: 0;
        background: white;
        z-index: 10;
        border-radius: 12px 12px 0 0;
    }
    .drag-handle {
        width: 40px;
        height: 4px;
        background-color: #ccc;
        border-radius: 2px;
        margin: 0 auto;
    }
    .toggle-title {
        font-size: 0.9rem;
        color: #70757a;
        margin-top: 5px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .status-icon {
        margin-right: 5px;
        transition: transform 0.3s;
    }

    .user-details-section, .location-list-section {
        padding: 15px;
    }
    .user-details-section {
        padding-bottom: 5px;
    }
    .location-list-section {
        padding-top: 5px;
    }
    .separator {
        border: none;
        border-top: 1px solid #eee;
        margin: 0 15px;
    }

    .info-header {
      color: #1a73e8; 
      font-weight: 600;
      padding-bottom: 8px;
      margin-top: 0;
      margin-bottom: 15px;
      font-size: 1rem;
    }
    .data-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 0;
    }
    .label {
      font-weight: 400;
      color: #5f6368; 
    }
    .value {
      font-weight: 500;
      color: #202124;
    }
    .hash {
      font-family: 'monospace';
      color: #1e8e3e; 
    }
    .gmaps-link {
        color: #1a73e8;
        text-decoration: none;
        font-size: 0.9rem;
        font-weight: 500;
        margin-top: 5px;
    }
    .gmaps-link:hover {
        text-decoration: underline;
    }
    .list-item {
        display: flex;
        align-items: center;
        padding: 10px 0;
        cursor: pointer;
        border-bottom: 1px solid #eee;
    }
    .list-item:last-child {
        border-bottom: none;
    }
    .focus-btn {
        background-color: #4285f4; 
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 0.9rem;
    }
    .message {
      padding: 12px;
      margin-top: 15px;
      border-radius: 8px;
      text-align: center;
      font-weight: 600;
    }
    .loading-message {
      background-color: #e9f7fe;
      color: #007bff;
    }
    .error-message {
      background-color: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    .spinner {
      border: 2px solid #cce5ff;
      border-top: 2px solid #007bff;
      border-radius: 50%;
      width: 14px;
      height: 14px;
      animation: spin 1s linear infinite;
      display: inline-block;
      margin-right: 8px;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    `
  ]
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
    
    private map: any;
    private userMarker: any;
    private searchMarker: any; 
    private ngeohash: any;
    private geoHashBounds: any;
    private updateInterval: any;
    private targetMarkers: any[] = [];
    
    isSheetExpanded: boolean = false; 
    isSearching: boolean = false; 
    searchError: string | null = null; 

    readonly targets: TargetLocation[] = [
        { name: 'Original Target', latlng: [13.72766661420566, 100.77253069896474], id: 'target_0' },
        { name: 'New Target 1 (East)', latlng: [13.725834545795538, 100.77736063726306], id: 'target_1' },
        { name: 'New Target 2 (West)', latlng: [13.725872896441372, 100.77386981149033], id: 'target_2' }
    ];
    
    userLat: number | null = null;
    userLng: number | null = null;
    userGeoHash: string | null = null;
    errorMessage: string | null = null; 
    
    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    public toggleSheet(): void {
        this.isSheetExpanded = !this.isSheetExpanded;
    }

    public getGoogleMapsLink(lat: number | null, lng: number | null): string {
        if (lat === null || lng === null) return '#';
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    public async searchAndFocus(query: string): Promise<void> {
        if (!query || this.isSearching) return;
        
        this.isSearching = true;
        this.searchError = null;
        
        try {
            const apiKey = ""; // REPLACE WITH YOUR KEY
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
            
            const systemPrompt = "You are a specialized geocoding service. When given a location name, find its geographic coordinates. Respond ONLY with a single, clean JSON object containing the latitude and longitude, formatted as: { \"lat\": [number], \"lng\": [number] }. If coordinates cannot be found, respond with { \"error\": \"Location not found\" }.";
            const userQuery = `Find the precise latitude and longitude coordinates for ${query}.`;
            
            const payload = {
                contents: [{ parts: [{ text: userQuery }] }],
                tools: [{ "google_search": {} }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "lat": { "type": "NUMBER" },
                            "lng": { "type": "NUMBER" },
                            "error": { "type": "STRING" }
                        }
                    }
                }
            };
            
            const response = await this.fetchWithRetry(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            
            if (!jsonText) {
                this.searchError = 'Geocoding service returned an unexpected response.';
                return;
            }

            const parsedJson = JSON.parse(jsonText);
            
            if (parsedJson.error) {
                this.searchError = `Could not find a location for "${query}". Please try a different name.`;
            } else if (typeof parsedJson.lat === 'number' && typeof parsedJson.lng === 'number') {
                const L = await import('leaflet');
                const location: [number, number] = [parsedJson.lat, parsedJson.lng];
                
                this.addSearchMarker(L, location, query);
                this.map.flyTo(location, 16, { duration: 1.5 });
                this.searchError = null; 
            } else {
                 this.searchError = 'Invalid coordinate data received.';
            }

        } catch (error) {
            console.error('API Error:', error);
            this.searchError = 'Failed to connect to the geocoding service.';
        } finally {
            this.isSearching = false;
        }
    }
    
    private addSearchMarker(L: any, location: [number, number], name: string): void {
        if (this.searchMarker) {
            this.map.removeLayer(this.searchMarker);
        }
        const searchIcon = L.icon({
            iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23e37400" width="40px" height="40px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>',
            iconSize: [40, 40],
            iconAnchor: [20, 40],
        });
        
        const gmapsLink = this.getGoogleMapsLink(location[0], location[1]);
        
        this.searchMarker = L.marker(location, { icon: searchIcon })
            .addTo(this.map)
            .bindPopup(`
                <b>Search Result: ${name}</b><br>
                Lat: ${location[0].toFixed(5)}, Lng: ${location[1].toFixed(5)}<br>
                <a href="${gmapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none;">Open in Google Maps ↗</a>
            `)
            .openPopup();
    }
    
    private async fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.status !== 429) return response;
                await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
            }
        }
        throw new Error('Max retries exceeded.');
    }

    // --- Lifecycle and Initialization ---
    
    async ngOnInit(): Promise<void> {
        if (!isPlatformBrowser(this.platformId)) return;
        const L = await import('leaflet');
        this.ngeohash = await import('ngeohash');
        
        // *** FIX for Vercel Build: Point to the assets copied by angular.json ***
        const iconRetinaUrl = 'assets/images/marker-icon-2x.png';
        const iconUrl = 'assets/images/marker-icon.png';
        const shadowUrl = 'assets/images/marker-shadow.png';
        
        if (L.Icon) {
            const DefaultIcon = L.Icon.extend({
              options: {
                shadowUrl,
                iconRetinaUrl,
                iconUrl,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
              }
            });
            L.Marker.prototype.options.icon = new DefaultIcon();
        }

        // Initialize map but wait for geolocation
        this.initMap(L);
        this.addTargetMarkers(L);
        this.startLocationInterval(L);
    }
    
    ngAfterViewInit(): void {
        if (isPlatformBrowser(this.platformId) && this.map) {
            setTimeout(() => {
                if (this.map) this.map.invalidateSize();
            }, 50);
        }
    }
    
    ngOnDestroy(): void {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.map) this.map.remove(); 
    }
    
    private initMap(L: any) {
        // Default center (fallback) if geolocation fails
        const defaultCenter: [number, number] = [13.72766661420566, 100.77253069896474];
        
        this.map = L.map('map', {
            center: defaultCenter, 
            zoom: 14 
        });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(this.map);
        
        setTimeout(() => {
            if (this.map) this.map.invalidateSize();
        }, 2000); 
    }
    
    private addTargetMarkers(L: any) {
        const targetIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', 
            iconSize: [40, 40],
            iconAnchor: [20, 40],
        });
        this.targets.forEach(target => {
            const gmapsLink = this.getGoogleMapsLink(target.latlng[0], target.latlng[1]);
            const marker = L.marker(target.latlng, { icon: targetIcon })
                .addTo(this.map)
                .bindPopup(`
                    <b>${target.name}</b><br>
                    Lat: ${target.latlng[0].toFixed(5)}, Lng: ${target.latlng[1].toFixed(5)}<br>
                    <a href="${gmapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none;">Open in Google Maps ↗</a>
                `);
            this.targetMarkers.push(marker);
        });
    }
    
    public focusOnUser(): void {
        if (this.map && this.userLat !== null && this.userLng !== null) {
            this.map.flyTo([this.userLat, this.userLng], 18, { duration: 1.5 });
            this.isSheetExpanded = false; 
        } else {
            console.warn('User location not yet available.');
        }
    }
    
    public focusOnTarget(location: [number, number]): void {
        if (this.map) {
            this.map.flyTo(location, 17, { duration: 1.5 });
            this.isSheetExpanded = false; 
        }
    }
    
    private startLocationInterval(L: any) {
        const updateLocation = () => {
            if (!navigator.geolocation) {
                this.errorMessage = 'Geolocation is not supported by your browser.';
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const lat = position.coords.latitude;
                    const lng = position.coords.longitude;
                    const hash = this.ngeohash.encode(lat, lng, 8); 
                    
                    // If this is the first location update, center the map on the user
                    if (this.userLat === null && this.userLng === null) {
                         this.map.setView([lat, lng], 16);
                    }

                    this.userLat = lat;
                    this.userLng = lng;
                    this.userGeoHash = hash;
                    this.errorMessage = null; 
                    
                    const userLocation: [number, number] = [lat, lng];
                    
                    if (this.userMarker) this.map.removeLayer(this.userMarker);
                    
                    const userIcon = L.icon({
                        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%231a73e8" width="40px" height="40px"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3" fill="white"/></svg>',
                        iconSize: [40, 40],
                        iconAnchor: [20, 20],
                    });
                    
                    const gmapsLink = this.getGoogleMapsLink(lat, lng);

                    this.userMarker = L.marker(userLocation, { icon: userIcon })
                        .addTo(this.map)
                        .bindPopup(`
                            <b>You are here</b><br>
                            Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}<br>GeoHash: ${hash}<br>
                            <a href="${gmapsLink}" target="_blank" style="color: #1a73e8; text-decoration: none;">Open in Google Maps ↗</a>
                        `);
                    
                    if (this.geoHashBounds) this.map.removeLayer(this.geoHashBounds); 
                    
                    const boundsArray = this.ngeohash.decode_bbox(hash); 
                    const bounds: L.LatLngBoundsExpression = [
                        [boundsArray[0], boundsArray[1]], 
                        [boundsArray[2], boundsArray[3]]  
                    ];
                    
                    this.geoHashBounds = L.rectangle(bounds, {
                        color: '#4285f4', 
                        weight: 2,
                        fillOpacity: 0.15, 
                        fillColor: '#4285f4'
                    }).addTo(this.map);
                },
                (error) => {
                    console.error('Error getting location:', error);
                    if (error.code === 1) {
                        this.errorMessage = 'Geolocation permission denied.';
                    } else {
                        this.errorMessage = 'Could not retrieve location data.';
                    }
                },
                { enableHighAccuracy: true }
            );
        };
        updateLocation();
        this.updateInterval = setInterval(updateLocation, 5000); 
    }
}