import { Component, OnInit, PLATFORM_ID, Inject, OnDestroy, AfterViewInit } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import * as L from 'leaflet'; 

// --- Interfaces ---
interface TargetLocation {
  name: string;
  latlng: [number, number];
  id: string;
  description?: string; 
  color: string; 
  distanceText?: string; 
  distance?: number; // Numeric distance property
  mapMarker?: any;
  rank?: number;
}

interface SearchResult {
  name: string;
  address: string;
  lat: number;
  lng: number;
  isLocal?: boolean;
  id?: string; 
}

// NEW: Interface for Zone definition
interface MapZone {
    name: string;
    hash: string; // GeoHash P5/P6 string defining the zone center/area
    id: string;
    zoomLevel: number;
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
            
            <p *ngIf="searchError" class="search-error-message">
                ⚠️ {{ searchError }}
            </p>
        </div>

        <div class="zone-selector-wrapper">
            <label>เลือกพื้นที่:</label>
            <select #zoneSelect (change)="focusOnSelectedZone(zoneSelect.value)" class="zone-select">
                <option *ngFor="let zone of zones" [value]="zone.hash">
                    {{ zone.name }}
                </option>
            </select>
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
                    <h2 class="details-title-wrapper">
                        <span class="color-dot" [style.backgroundColor]="selectedLocation.color"></span>
                        <span class="details-title">{{ selectedLocation.name }}</span>
                    </h2>
                </div>
                
                <div class="details-content">
                    <div class="detail-row">
                        <span class="detail-icon">📍</span>
                        <span class="detail-text">{{ selectedLocation.latlng[0].toFixed(5) }}, {{ selectedLocation.latlng[1].toFixed(5) }}</span>
                    </div>
                    <div class="detail-row" *ngIf="selectedLocation.distanceText">
                        <span class="detail-icon">📏</span>
                        <span class="detail-text">ห่างจากคุณ {{ selectedLocation.distanceText }}</span>
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
                        <span class="list-rank" [style.backgroundColor]="target.color">{{ target.rank }}</span>
                        <div class="list-text">
                            <div class="list-name">{{ target.name }}</div>
                            <div class="list-sub">
                                <span class="distance-badge" *ngIf="target.distanceText">📏 {{ target.distanceText }}</span>
                            </div>
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
    .app-container { width: 100vw; height: 100vh; height: 100dvh; position: relative; font-family: 'Sarabun', 'Roboto', sans-serif; overflow: hidden; background: #f8f9fa; }
    #map { width: 100%; height: 100%; position: absolute; z-index: 10; }

    .top-overlay-container { position: absolute; top: 0; left: 0; width: 100%; z-index: 20; padding-top: max(16px, env(safe-area-inset-top)); display: flex; flex-direction: column; align-items: center; pointer-events: none; }
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
    .suggestion-icon { margin-right: 12px; font-size: 1.1rem; color: #70757a; min-width: 24px; text-align: center; }

    .search-status { background: rgba(255,255,255,0.9); padding: 8px 15px; border-radius: 20px; margin-top: 5px; font-size: 0.85rem; color: #5f6368; box-shadow: 0 2px 5px rgba(0,0,0,0.1); display: inline-flex; align-items: center; pointer-events: auto; }
    .spinner-small { width: 16px; height: 16px; border: 2px solid #ccc; border-top-color: #1a73e8; border-radius: 50%; animation: spin 1s linear infinite; display: inline-block; margin-right: 8px; }
    .search-error-message { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6fb; padding: 8px 15px; border-radius: 8px; margin-top: 5px; font-size: 0.9rem; text-align: center; pointer-events: auto; }

    .zone-selector-wrapper {
        width: 90vw;
        max-width: 400px;
        margin-top: 10px;
        display: flex;
        align-items: center;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.9);
        border-radius: 8px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        pointer-events: auto;
    }
    .zone-select {
        flex: 1;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 0.9rem;
        appearance: none;
        background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%23333" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>') no-repeat right 8px center;
        background-size: 16px;
    }


    .fab-container { position: absolute; bottom: calc(150px + env(safe-area-inset-bottom)); right: 16px; z-index: 20; pointer-events: none; }
    .location-fab { width: 56px; height: 56px; background: white; border-radius: 50%; box-shadow: 0 4px 8px rgba(0,0,0,0.2); border: none; font-size: 1.5rem; cursor: pointer; pointer-events: auto; display: flex; align-items: center; justify-content: center; color: #1a73e8; }

    .bottom-overlay-container { position: absolute; bottom: 0; left: 0; width: 100%; z-index: 30; pointer-events: none; display: flex; justify-content: center; padding-bottom: env(safe-area-inset-bottom); transform: translateY(calc(100% - 120px)); transition: transform 0.3s ease-out; }
    .bottom-overlay-container.expanded { transform: translateY(0); }
    
    .sliding-sheet { width: 100%; max-width: 500px; background: white; border-radius: 16px 16px 0 0; box-shadow: 0 -8px 20px rgba(0,0,0,0.1); padding-bottom: 20px; pointer-events: auto; max-height: 80vh; display: flex; flex-direction: column; }
    
    .drag-handle-area { padding: 12px; display: flex; justify-content: center; cursor: pointer; background: white; border-radius: 16px 16px 0 0; flex-shrink: 0; }
    .drag-handle { width: 32px; height: 4px; background: #dfe1e5; border-radius: 2px; }

    .location-details-view { padding: 0 20px 20px; }
    .details-header { display: flex; align-items: center; margin-bottom: 16px; }
    .back-btn { background: none; border: none; color: #1a73e8; font-size: 0.9rem; cursor: pointer; padding: 0; margin-right: 12px; font-weight: 500; }
    
    .details-title-wrapper { display: flex; align-items: center; }
    .color-dot { width: 12px; height: 12px; border-radius: 50%; margin-right: 8px; flex-shrink: 0; }
    .details-title { font-size: 1.25rem; margin: 0; color: #202124; }
    
    .detail-row { display: flex; align-items: center; margin-bottom: 12px; color: #5f6368; font-size: 0.95rem; }
    .detail-icon { margin-right: 12px; min-width: 24px; text-align: center; }
    .primary-btn { display: block; width: 100%; padding: 10px 0; background: #1a73e8; color: white; text-align: center; border-radius: 24px; text-decoration: none; font-weight: 500; margin-top: 16px; }

    .section-header { padding: 0 20px 8px; border-bottom: 1px solid #f1f3f4; }
    .section-header h3 { margin: 0; font-size: 1rem; color: #202124; }
    .location-list { overflow-y: auto; flex-grow: 1; }
    .list-item { padding: 12px 20px; display: flex; align-items: center; border-bottom: 1px solid #f1f3f4; cursor: pointer; }
    .list-item:hover { background: #f8f9fa; }
    
    .list-rank { display: inline-flex; width: 28px; height: 28px; border-radius: 50%; background-color: #343a40; color: white; font-size: 0.9rem; font-weight: 700; align-items: center; justify-content: center; margin-right: 16px; flex-shrink: 0; }
    .list-icon { font-size: 1.2rem; margin-right: 16px; min-width: 24px; } 
    .list-text { flex: 1; }
    .list-name { font-weight: 500; color: #3c4043; font-size: 0.95rem; }
    .list-sub { font-size: 0.8rem; color: #70757a; display: flex; align-items: center; gap: 5px; } 
    .distance-badge { display: inline-block; background-color: #e8f0fe; color: #1967d2; padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: 600; }
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
    private watchId: number | null = null;
    
    isSheetExpanded: boolean = false; 
    isSearching: boolean = false; 
    showSuggestions: boolean = false;
    currentSearchQuery: string = '';
    searchError: string | null = null;
    searchResults: SearchResult[] = [];
    selectedLocation: TargetLocation | null = null;

    private searchSubject = new Subject<string>();
    private searchSubscription: Subscription | null = null;

    // 🏆 FIX: Removed readonly from targets, added MapMarker property initialization
    targets: TargetLocation[] = [
        { name: 'อาคารเรียนรวม 12 ชั้น (E12)', latlng: [13.727549, 100.772554], id: 'kmitl_e12', description: 'ตึกเรียนรวมคณะวิศวกรรมศาสตร์', color: '#007bff' },
        { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.731107, 100.781045], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ', color: '#28a745' },
        { name: 'สำนักหอสมุดกลาง (KLLC)', latlng: [13.727624, 100.778683], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้และห้องสมุด', color: '#ffc107' },
        { name: 'สำนักงานอธิการบดี', latlng: [13.731022, 100.777660], id: 'kmitl_president', description: 'ตึกกรมหลวงนราธิวาสราชนครินทร์', color: '#6f42c1' },
        { name: 'หอประชุมเจ้าพระยาสุรวงษ์ฯ', latlng: [13.726643, 100.779270], id: 'kmitl_hall', description: 'หอประชุมใหญ่ สจล.', color: '#17a2b8' },
        { name: 'คณะสถาปัตยกรรมศาสตร์', latlng: [13.725334, 100.777463], id: 'kmitl_arch', description: 'ริมทางรถไฟ', color: '#fd7e14' },
        { name: 'รพ.พระจอมเกล้าเจ้าคุณทหาร', latlng: [13.732349, 100.789629], id: 'kmitl_hospital', description: 'ศูนย์การแพทย์', color: '#e83e8c' },
        { name: 'อาคารพระเทพฯ (ตึกปฏิบัติการ)', latlng: [13.730024, 100.776838], id: 'kmitl_eng_labs', description: 'ศูนย์ปฏิบัติการวิศวกรรม', color: '#20c997' },
        { name: 'วิทยาลัยนวัตกรรมการผลิตขั้นสูง', latlng: [13.730062, 100.775427], id: 'kmitl_60th', description: 'อาคารเรียนรวม', color: '#343a40' }
    ];
    
    userLat: number | null = null;
    userLng: number | null = null;
    userGeoHash: string | null = null;
    errorMessage: string | null = null; 
    
    constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

    // --------------------------------------------------------------------------------
    // --- UTILITY FUNCTIONS ---
    // --------------------------------------------------------------------------------

    private createPinIcon(L: any, hexColor: string): any {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${hexColor}" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
        return L.icon({
            iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`,
            iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
        });
    }

    private createUserIcon(L: any): any {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4285F4" width="48px" height="48px"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>`;
        return L.icon({
            iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`,
            iconSize: [24, 24], iconAnchor: [12, 12]
        });
    }

    private createRankedPinIcon(L: any, hexColor: string, rank: number): any {
        const pinPath = "M20 0 C10 0 2 8 2 16 C2 24 10 38 20 40 C30 38 38 24 38 16 C38 8 30 0 20 0 Z";

        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40px" height="40px">
            <path d="${pinPath}" fill="${hexColor}" stroke="white" stroke-width="2"/>
            <text x="20" y="18" font-family="Roboto, sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="bold">${rank}</text>
        </svg>`;

        return L.icon({
            iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`,
            iconSize: [40, 40],
            iconAnchor: [20, 40], 
            popupAnchor: [0, -38]
        });
    }

    // --- Interactions ---
    public toggleSheet(): void {
        this.isSheetExpanded = !this.isSheetExpanded;
    }

    public async onLocationSelect(target: TargetLocation): Promise<void> {
        this.selectedLocation = target;
        this.isSheetExpanded = true; 
        
        if (isPlatformBrowser(this.platformId)) {
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
    }

    public clearSelection(): void {
        this.selectedLocation = null;
    }

    public getGoogleMapsLink(lat: number, lng: number): string {
        if (lat === null || lng === null) return '#';
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }

    // --- Zone selector helpers (used by template) ---
    // Minimal zone structure so template bindings compile.
    zones: { name: string; hash: string; center: [number, number]; zoom?: number }[] = [
        { name: 'Zone1', hash: 'w21z', center: [13.7275, 100.7776], zoom: 16 },
        { name: 'Zone2', hash: 'w21y', center: [13.7300, 100.7768], zoom: 16 },
        { name: 'Zone3', hash: 'w21x', center: [13.7276, 100.7786], zoom: 16 }
    ];

    /**
     * Focus the map on the selected zone hash from the <select>.
     * Called from the template: (change)="focusOnSelectedZone(zoneSelect.value)"
     */
    public async focusOnSelectedZone(hash: string): Promise<void> {
        if (!hash) return;
        const zone = this.zones.find(z => z.hash === hash);
        if (!zone) return;

        if (isPlatformBrowser(this.platformId)) {
            if (!this.map) {
                // map may be initialized later; nothing to do if not present
                return;
            }

            if (this.map && zone.center) {
                const zoom = zone.zoom ?? 15;
                this.map.flyTo(zone.center, zoom, { duration: 1.2 });
            }
        }
    }

    // --- Search Logic (Omitted) ---
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
            description: result.address,
            color: '#FF0000'
        };
        this.onLocationSelect(target);
    }

    private performSearch(query: string): void {
        this.isSearching = true;
        this.searchError = null;
        // ... API logic omitted ...
        this.isSearching = false;
    }

    private addSearchMarker(L: any, location: [number, number], name: string): void {
        if (!this.map) return;
        const icon = this.createPinIcon(L, '#FF0000');
        this.searchMarker = L.marker(location, { icon: icon }).addTo(this.map).bindPopup(`<b>${name}</b>`).openPopup();
    }

    // --- Lifecycle ---
    ngOnInit(): void {
        this.searchSubscription = this.searchSubject.pipe(debounceTime(500), distinctUntilChanged()).subscribe(query => this.performSearch(query));
    }

    async ngAfterViewInit(): Promise<void> {
        if (isPlatformBrowser(this.platformId)) {
            const LeafletModule = await import('leaflet');
            const L = (LeafletModule as any).default || LeafletModule;
            this.ngeohash = await import('ngeohash');

            const iconRetinaUrl = 'assets/images/marker-icon-2x.png';
            const iconUrl = 'assets/images/marker-icon.png';
            const shadowUrl = 'assets/images/marker-shadow.png';
            if (L.Icon) {
                const DefaultIcon = L.Icon.extend({ options: { iconUrl, iconRetinaUrl, shadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], tooltipAnchor: [16, -28], shadowSize: [41, 41] } });
                L.Marker.prototype.options.icon = new (DefaultIcon as any)();
            }
            // 🎯 FIX: Push map initialization to the next tick to ensure DOM element is available
            setTimeout(() => {
                const success = this.initMap(L);
                if (success) {
                    this.startTracking(L);
                }
            }, 200); 
        }
    }

    ngOnDestroy(): void {
        if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
        if (this.searchSubscription) this.searchSubscription.unsubscribe();
        if (this.map) this.map.remove(); 
    }

    private initMap(L: any): boolean {
        const mapElement = document.getElementById('map');
        if (!mapElement) { console.error('Map container not found!'); return false; }
        const defaultCenter: [number, number] = [13.72766661420566, 100.77253069896474];
        if (this.map) { this.map.remove(); this.map = null; }
        this.map = L.map('map', { center: defaultCenter, zoom: 15, zoomControl: false });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(this.map);
        
        this.targets.forEach(target => {
            // Initial pin creation uses the Ranked style with rank 0
            const targetIcon = this.createRankedPinIcon(L, target.color || '#007bff', 0); 
            const marker = L.marker(target.latlng, { icon: targetIcon }).addTo(this.map);
            target.mapMarker = marker;
            marker.on('click', () => this.onLocationSelect(target));
        });

        setTimeout(() => { if (this.map) { this.map.invalidateSize(); } }, 500);
        return true; 
    }

    public focusOnUser(): void {
        if (this.map && this.userLat !== null && this.userLng !== null) {
            this.map.flyTo([this.userLat, this.userLng], 18);
            this.selectedLocation = null;
            this.isSheetExpanded = false;
        }
    }

    private startTracking(L: any) {
        if (!navigator.geolocation) { this.errorMessage = "Geolocation not supported"; return; }
        const options = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };

        this.watchId = navigator.geolocation.watchPosition(
            (pos) => {
                if (!this.map || !this.ngeohash) return; 

                this.userLat = pos.coords.latitude;
                this.userLng = pos.coords.longitude;
                this.userGeoHash = this.ngeohash.encode(this.userLat, this.userLng, 8);

                // Distance Calc & Ranking
                const userLatLng = L.latLng(this.userLat, this.userLng);
                this.targets.forEach(target => {
                    const distanceMeters = userLatLng.distanceTo(L.latLng(target.latlng));
                    target.distanceText = (distanceMeters < 1000) ? `${Math.round(distanceMeters)} ม.` : `${(distanceMeters / 1000).toFixed(1)} กม.`;
                    target.distance = distanceMeters;
                });
                
                const sortedTargets = [...this.targets].sort((a, b) => (a.distance || 0) - (b.distance || 0));
                this.targets = sortedTargets;
                
                this.targets.forEach((target, index) => {
                    const rank = index + 1;
                    target.rank = rank;
                    
                    if (target.mapMarker) {
                        const newIcon = this.createRankedPinIcon(L, target.color, rank);
                        target.mapMarker.setIcon(newIcon);
                    }
                });

                // User Marker Logic
                if (!this.userMarker) { 
                    const userIcon = this.createUserIcon(L);
                    this.userMarker = L.marker([this.userLat, this.userLng], { icon: userIcon }).addTo(this.map);
                    this.map.setView([this.userLat, this.userLng], 16);
                } else {
                    this.userMarker.setLatLng([this.userLat, this.userLng]);
                }

                // if (this.geoHashBounds) this.map.removeLayer(this.geoHashBounds); 
                // const boundsArray = this.ngeohash.decode_bbox(this.userGeoHash); 
                // const bounds: L.LatLngBoundsExpression = [[boundsArray[0], boundsArray[1]], [boundsArray[2], boundsArray[3]]];
                // this.geoHashBounds = L.rectangle(bounds, { color: '#4285f4', weight: 2, fillOpacity: 0.15, fillColor: '#4285f4' }).addTo(this.map);
            },
            (err) => { console.error("Geolocation error:", err); },
            options
        );
    }
}