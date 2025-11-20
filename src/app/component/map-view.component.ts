import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
// We need to import the Leaflet type definitions for L, but we must NOT import the library itself statically.
// import * as L from 'leaflet'; // ❌ This line must remain commented out or removed for SSR compatibility.

interface TargetLocation {
  name: string;
  latlng: [number, number];
  id: string;
  description?: string; 
}

interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  isLocal?: boolean;
  id?: string; 
}

@Component({
  selector: 'app-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="app-container">
      
      <div id="map" class="map-canvas"></div>

      <div class="top-overlay-container">
        <div class="search-wrapper">
            <div class="search-bar">
                <span class="search-icon">🔍</span>
                <input 
                    type="text" 
                    placeholder="ค้นหาสถานที่..." 
                    class="search-input" 
                    #searchInput
                    (input)="onSearchInput(searchInput.value)"
                    (focus)="showSuggestions = true"
                    [value]="currentSearchQuery"
                >
                <span *ngIf="currentSearchQuery" class="clear-icon" (click)="clearSearch()">✕</span>
            </div>

            <div class="search-suggestions" *ngIf="showSuggestions && (searchResults.length > 0 || isSearching)">
                <div class="suggestion-item loading" *ngIf="isSearching">
                    <span class="spinner-small"></span> กำลังค้นหา...
                </div>
                <div *ngFor="let result of searchResults" class="suggestion-item" (click)="selectSearchResult(result)">
                    <span class="suggestion-icon">{{ result.isLocal ? '🏛️' : '📍' }}</span>
                    <div class="suggestion-text">
                        <div class="suggestion-name">{{ result.name }}</div>
                        <div class="suggestion-address">{{ result.address }}</div>
                    </div>
                </div>
            </div>
            <p *ngIf="searchError" class="search-error-message">⚠️ {{ searchError }}</p>
        </div>
      </div>
      
      <div class="fab-container">
        <button class="location-fab" (click)="focusOnUser()" title="ตำแหน่งปัจจุบัน">
          <span class="fab-icon">🎯</span>
        </button>
      </div>

      <div class="bottom-overlay-container" [class.expanded]="isSheetExpanded">
        <div class="sliding-sheet">
            <div class="drag-handle-area" (click)="toggleSheet()">
                <div class="drag-handle"></div>
            </div>
            
            <div class="location-details-view" *ngIf="selectedLocation">
                <div class="details-header">
                    <button class="back-btn" (click)="clearSelection()">← กลับ</button>
                    <h2 class="details-title">{{ selectedLocation.name }}</h2>
                </div>
                
                <div class="details-content">
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <span class="detail-text">{{ selectedLocation.latlng[0].toFixed(5) }}, {{ selectedLocation.latlng[1].toFixed(5) }}</span>
                    </div>
                    <div class="detail-row" *ngIf="selectedLocation.description">
                        <span class="detail-icon">ℹ️</span>
                        <span class="detail-text">{{ selectedLocation.description }}</span>
                    </div>
                    
                    <div class="action-buttons">
                        <a [href]="getGoogleMapsLink(selectedLocation.latlng[0], selectedLocation.latlng[1])" 
                           target="_blank" 
                           class="primary-btn">
                           เปิดใน Google Maps ↗
                        </a>
                    </div>
                </div>
            </div>

            <div class="default-list-view" *ngIf="!selectedLocation">
                <div class="section-header">
                    <h3>สถานที่แนะนำ (KMITL)</h3>
                </div>
                <div class="location-list">
                    <div *ngFor="let target of targets" class="list-item" (click)="onLocationSelect(target)">
                        <span class="list-icon">🏛️</span>
                        <div class="list-text">
                            <div class="list-name">{{ target.name }}</div>
                            <div class="list-sub">สถาบันเทคโนโลยีพระจอมเกล้าเจ้าคุณทหารลาดกระบัง</div>
                        </div>
                        <button class="navigate-btn">ดู</button>
                    </div>
                </div>
                
                <div class="user-mini-status" *ngIf="userGeoHash">
                    <small>ตำแหน่งของคุณ: {{ userLat?.toFixed(4) }}, {{ userLng?.toFixed(4) }} ({{ userGeoHash }})</small>
                </div>
            </div>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .app-container { width: 100vw; height: 100vh; position: relative; font-family: 'Sarabun', 'Roboto', sans-serif; overflow: hidden; background: #f8f9fa; }
    #map { width: 100%; height: 100%; position: absolute; z-index: 10; }

    .top-overlay-container { position: absolute; top: 0; left: 0; width: 100%; z-index: 20; padding-top: 16px; display: flex; justify-content: center; pointer-events: none; }
    .search-wrapper { width: 90%; max-width: 400px; pointer-events: auto; position: relative; }
    .search-bar { background: white; height: 48px; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.2); display: flex; align-items: center; padding: 0 12px; }
    .search-input { flex: 1; border: none; outline: none; font-size: 1rem; padding: 0 8px; color: #333; }
    .search-icon, .clear-icon { font-size: 1.2rem; color: #5f6368; cursor: pointer; }
    
    .search-suggestions { position: absolute; top: 56px; left: 0; width: 100%; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-height: 60vh; overflow-y: auto; }
    .suggestion-item { padding: 12px 16px; border-bottom: 1px solid #f1f3f4; cursor: pointer; display: flex; align-items: center; }
    .suggestion-item:hover { background: #f8f9fa; }
    .suggestion-text { margin-left: 12px; }
    .suggestion-name { font-weight: 500; font-size: 0.95rem; color: #202124; }
    .suggestion-address { font-size: 0.8rem; color: #70757a; }

    .search-status { background: rgba(255,255,255,0.9); padding: 8px 15px; border-radius: 20px; margin-top: 5px; font-size: 0.85rem; color: #5f6368; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: inline-flex; align-items: center; pointer-events: auto; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #1a73e8; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px; }
    .search-error-message { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; padding: 8px 15px; border-radius: 8px; margin-top: 5px; font-size: 0.9rem; text-align: center; pointer-events: auto; }

    .fab-container { position: absolute; bottom: 180px; right: 16px; z-index: 20; pointer-events: none; }
    .location-fab { width: 56px; height: 56px; background: white; border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.2); border: none; font-size: 1.5rem; cursor: pointer; pointer-events: auto; display: flex; align-items: center; justify-content: center; color: #1a73e8; }

    .bottom-overlay-container { position: absolute; bottom: 0; left: 0; width: 100%; z-index: 30; pointer-events: none; display: flex; justify-content: center; transform: translateY(calc(100% - 120px)); transition: transform 0.3s ease-out; }
    .bottom-overlay-container.expanded { transform: translateY(0); }
    
    .sliding-sheet { width: 100%; max-width: 500px; background: white; border-radius: 16px 16px 0 0; box-shadow: 0 -2px 10px rgba(0,0,0,0.1); padding-bottom: 20px; pointer-events: auto; max-height: 80vh; display: flex; flex-direction: column; }
    
    .drag-handle-area { padding: 12px; display: flex; justify-content: center; cursor: pointer; background: white; border-radius: 16px 16px 0 0; flex-shrink: 0; }
    .drag-handle { width: 32px; height: 4px; background: #dfe1e5; border-radius: 2px; }

    .location-details-view { padding: 0 20px 20px; }
    .details-header { display: flex; align-items: center; margin-bottom: 16px; }
    .back-btn { background: none; border: none; color: #1a73e8; font-size: 0.9rem; cursor: pointer; padding: 0; margin-right: 12px; font-weight: 500; }
    .details-title { font-size: 1.25rem; margin: 0; color: #202124; }
    .detail-row { display: flex; align-items: center; margin-bottom: 12px; color: #5f6368; font-size: 0.95rem; }
    .detail-icon { margin-right: 12px; min-width: 24px; text-align: center; }
    .primary-btn { display: block; width: 100%; padding: 10px 0; background: #1a73e8; color: white; text-align: center; border-radius: 24px; text-decoration: none; font-weight: 500; margin-top: 16px; }

    .section-header { padding: 0 20px 8px; border-bottom: 1px solid #f1f3f4; }
    .section-header h3 { margin: 0; font-size: 1rem; color: #202124; }
    .location-list { overflow-y: auto; flex-grow: 1; }
    .list-item { padding: 12px 20px; display: flex; align-items: center; border-bottom: 1px solid #f1f3f4; cursor: pointer; }
    .list-item:hover { background: #f8f9fa; }
    .list-icon { font-size: 1.2rem; margin-right: 16px; }
    .list-text { flex: 1; }
    .list-name { font-weight: 500; color: #3c4043; font-size: 0.95rem; }
    .list-sub { font-size: 0.8rem; color: #70757a; }
    .navigate-btn { background: #e8f0fe; color: #1967d2; border: none; padding: 6px 12px; border-radius: 16px; font-size: 0.8rem; font-weight: 500; cursor: pointer; }
    
    .user-mini-status { padding: 8px 20px; border-top: 1px solid #eee; color: #70757a; font-size: 0.75rem; text-align: center; background: #f8f9fa; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `]
})
export class MapComponent implements OnInit, OnDestroy, AfterViewInit {
    
    private map: any;
    private userMarker: any;
    private searchMarker: any; 
    private ngeohash: any;
    private geoHashBounds: any;
    private updateInterval: any;
    
    isSheetExpanded: boolean = false; 
    isSearching: boolean = false; 
    showSuggestions: boolean = false;
    currentSearchQuery: string = '';
    searchError: string | null = null;
    searchResults: SearchResult[] = [];
    selectedLocation: TargetLocation | null = null;

    private searchSubject = new Subject<string>();
    private searchSubscription: Subscription | null = null;

    readonly targets: TargetLocation[] = [
        // Updated coordinates (assumed to be correct based on previous user input)
        { name: 'อาคารเรียนรวม 12 ชั้น (E12)', latlng: [13.727549228597026, 100.77255458246205], id: 'kmitl_e12', description: 'ตึกเรียนรวมคณะวิศวกรรมศาสตร์' },
        { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.73110775313755, 100.78104593482931], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ' },
        { name: 'สำนักหอสมุดกลาง (KLLC)', latlng: [13.727624181555798, 100.77868310812387], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้และห้องสมุด' },
        { name: 'สำนักงานอธิการบดี', latlng: [13.731022304549109, 100.77766077763981], id: 'kmitl_president', description: 'ตึกกรมหลวงนราธิวาสราชนครินทร์' },
        { name: 'หอประชุมเจ้าพระยาสุรวงษ์ฯ', latlng: [13.72664371810848, 100.7792703321349], id: 'kmitl_hall', description: 'หอประชุมใหญ่ สจล.' },
        { name: 'คณะสถาปัตยกรรมศาสตร์', latlng: [13.725334824782951, 100.77746353790184], id: 'kmitl_arch', description: 'ริมทางรถไฟ' },
        { name: 'รพ.พระจอมเกล้าเจ้าคุณทหาร', latlng: [13.732349221023322, 100.789629628721], id: 'kmitl_hospital', description: 'ศูนย์การแพทย์' },
        { name: 'อาคารพระเทพฯ (ตึกปฏิบัติการ)', latlng: [13.730024512451434, 100.77683801915526], id: 'kmitl_eng_labs', description: 'ศูนย์ปฏิบัติการวิศวกรรม' },
        { name: 'วิทยาลัยนวัตกรรมการผลิตขั้นสูง', latlng: [13.730062563193098, 100.77542709470409], id: 'kmitl_60th', description: 'อาคารเรียนรวม' }
    ];
    
    userLat: number | null = null;
    userLng: number | null = null;
    userGeoHash: string | null = null;
    errorMessage: string | null = null; 
    
    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    // --- Interactions ---

    public toggleSheet(): void {
        this.isSheetExpanded = !this.isSheetExpanded;
    }

    public async onLocationSelect(target: TargetLocation): Promise<void> {
        this.selectedLocation = target;
        this.isSheetExpanded = true; 
        
        // 1. Dynamic import of Leaflet
        const L = await import('leaflet');
        
        if (this.map) {
            this.map.flyTo(target.latlng, 18, { duration: 1.5 });
            
            const isSavedLocation = this.targets.some(t => t.id === target.id);
            
            if (this.searchMarker) {
                this.map.removeLayer(this.searchMarker);
                this.searchMarker = undefined;
            }

            if (!isSavedLocation) {
                this.addSearchMarker(L, target.latlng, target.name);
            }
        }
    }

    public clearSelection(): void {
        this.selectedLocation = null;
    }

    public getGoogleMapsLink(lat: number, lng: number): string {
        // Corrected format for reliable Google Maps linking
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    // --- Search Logic ---

    public onSearchInput(query: string): void {
        this.currentSearchQuery = query;
        this.showSuggestions = true;
        if (!query || query.length < 2) {
            this.searchResults = [];
            return;
        }
        this.searchSubject.next(query);
    }

    public clearSearch(): void {
        this.currentSearchQuery = '';
        this.searchResults = [];
        this.showSuggestions = false;
        this.isSearching = false;
        this.searchError = null;
        if (this.searchMarker && this.map) {
            this.map.removeLayer(this.searchMarker);
        }
    }

    public async selectSearchResult(result: SearchResult): Promise<void> {
        this.showSuggestions = false;
        this.currentSearchQuery = result.name;
        
        const targetId = result.id || 'search_result_' + Date.now();

        const target: TargetLocation = {
            name: result.name,
            latlng: [result.lat, result.lng],
            id: targetId,
            description: result.address
        };
        
        this.onLocationSelect(target);
    }

    private performSearch(query: string): void {
        this.isSearching = true;
        this.searchError = null;

        const lowerQuery = query.toLowerCase();
        const localMatches: SearchResult[] = this.targets
            .filter(target => target.name.toLowerCase().includes(lowerQuery))
            .map(target => ({
                name: target.name,
                address: 'KMITL',
                lat: target.latlng[0],
                lng: target.latlng[1],
                isLocal: true,
                id: target.id 
            }));
        
        this.searchResults = [...localMatches];
        
        const apiKey = ""; // ⚠️ REPLACE WITH YOUR API KEY
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        
        const systemPrompt = `
            You are a location search assistant for Thailand.
            Find up to 5 distinct real-world locations that match the user's query. 
            Respond ONLY with a valid JSON ARRAY of objects. 
            Each object must have: "name" (string), "address" (string), "lat" (number), "lng" (number).
            If no locations found, return [].
        `;
        
        const payload = {
            contents: [{ parts: [{ text: `Find locations matching: "${query}"` }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { responseMimeType: "application/json" }
        };
        
        fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(response => response.json())
        .then(result => {
            const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!jsonText) return;
            
            const parsed = JSON.parse(jsonText);
            const apiLocations: SearchResult[] = Array.isArray(parsed) ? parsed : (parsed.locations || []);
            
            this.searchResults = [...localMatches, ...apiLocations];
        })
        .catch(error => {
            console.error('Search API Error:', error);
        })
        .finally(() => {
            this.isSearching = false;
        });
    }

    private addSearchMarker(L: any, location: [number, number], name: string): void {
        const icon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', 
            iconSize: [40, 40],
            iconAnchor: [20, 40],
            popupAnchor: [0, -40]
        });

        this.searchMarker = L.marker(location, { icon: icon })
            .addTo(this.map)
            .bindPopup(`
                <div style="text-align:center; font-family: 'Sarabun', sans-serif;">
                    <b>${name}</b>
                </div>
            `)
            .openPopup();
    }

    // --- Lifecycle ---

    ngOnInit(): void {
        this.searchSubscription = this.searchSubject.pipe(
            debounceTime(500),
            distinctUntilChanged()
        ).subscribe(query => this.performSearch(query));
    }

    async ngAfterViewInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
        
        // 🏆 CRITICAL FIX: Safely import the Leaflet module and extract the core object.
        const LeafletModule = await import('leaflet');
        // This line attempts to get the object from .default (common ES module pattern) 
        // or uses the module itself (commonJS pattern).
        const L = (LeafletModule as any).default || LeafletModule; 
        
        this.ngeohash = await import('ngeohash');

        // --- Leaflet Icon Fix (Kept from previous steps) ---
        const iconRetinaUrl = 'assets/images/marker-icon-2x.png';
        const iconUrl = 'assets/images/marker-icon.png';
        const shadowUrl = 'assets/images/marker-shadow.png';
        
        if (L.Icon) {
            const DefaultIcon = L.Icon.extend({
                options: { 
                    iconUrl, iconRetinaUrl, shadowUrl,
                    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                }
            });
            // Use the correctly defined L object to modify the prototype
            L.Marker.prototype.options.icon = new (DefaultIcon as any)(); 
        }
        // ----------------------------------------------------

        this.initMap(L);
        this.startLocationInterval(L);
    }
}

    ngOnDestroy(): void {
        if (this.updateInterval) clearInterval(this.updateInterval);
        if (this.searchSubscription) this.searchSubscription.unsubscribe();
        if (this.map) this.map.remove(); 
    }

    private initMap(L: any) {
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map container not found!');
            return; 
        }
        
        const defaultCenter: [number, number] = [13.72766661420566, 100.77253069896474];
        
        if (this.map) {
            this.map.remove();
            this.map = null; 
        }

        this.map = L.map('map', { center: defaultCenter, zoom: 15, zoomControl: false });
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(this.map);
        
        // Add markers for all saved targets (Blue/Default icons)
        const targetIcon = L.icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
            iconSize: [32, 32], iconAnchor: [16, 32]
        });
        
        this.targets.forEach(target => {
            const marker = L.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
            marker.on('click', () => this.onLocationSelect(target));
        });

        // Use a timeout to ensure the map renders correctly (invalidateSize fix)
        setTimeout(() => { 
            if (this.map) {
                this.map.invalidateSize(); 
            }
        }, 500); // 500ms is safer than 100ms or 50ms
    }

    public focusOnUser(): void {
        if (this.map && this.userLat) {
            this.map.flyTo([this.userLat, this.userLng], 18);
            this.selectedLocation = null;
            this.isSheetExpanded = false;
        }
    }

    private startLocationInterval(L: any) {
        const updateLocation = () => {
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition(pos => {
                this.userLat = pos.coords.latitude;
                this.userLng = pos.coords.longitude;
                this.userGeoHash = this.ngeohash.encode(this.userLat, this.userLng, 8);
                
                if (!this.userMarker && this.map) { 
                    const userIcon = L.icon({
                        iconUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234285F4" width="48px" height="48px"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>',
                        iconSize: [24, 24], iconAnchor: [12, 12]
                    });
                    this.userMarker = L.marker([this.userLat, this.userLng], { icon: userIcon }).addTo(this.map);
                    this.map.setView([this.userLat, this.userLng], 16);
                } else if (this.userMarker) {
                    this.userMarker.setLatLng([this.userLat, this.userLng]);
                }
                
                // GeoHash bounds logic
                if (this.geoHashBounds && this.map) this.map.removeLayer(this.geoHashBounds); 
                const boundsArray = this.ngeohash.decode_bbox(this.userGeoHash); 
                const bounds: L.LatLngBoundsExpression = [[boundsArray[0], boundsArray[1]], [boundsArray[2], boundsArray[3]]];
                this.geoHashBounds = L.rectangle(bounds, { color: '#4285f4', weight: 2, fillOpacity: 0.15, fillColor: '#4285f4' }).addTo(this.map);

            }, err => {
                this.errorMessage = "Cannot get location";
            }, { enableHighAccuracy: true });
        };
        updateLocation();
        this.updateInterval = setInterval(updateLocation, 5000); 
    }
}