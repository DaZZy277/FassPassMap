import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, map } from 'rxjs/operators';

// --- Shared Interfaces ---
export interface TargetLocation {
    name: string;
    latlng: [number, number];
    id: string;
    description?: string; 
    color: string; 
    distanceText?: string; 
    distance?: number; 
    mapMarker?: any;
    rank?: number;
}

export interface MapZone {
    name: string;
    hash: string;
    id: string;
    zoomLevel: number;
}

export interface SearchResult {
    name: string;
    address: string;
    lat: number;
    lng: number;
    isLocal?: boolean;
    id?: string; 
}

export type PositionMode = 'GPS' | 'MANUAL';

@Injectable({
    providedIn: 'root'
})
export class MapService {

    // --- Data Sources ---
    public targetsSubject = new BehaviorSubject<TargetLocation[]>([]); 
    public targets$: Observable<TargetLocation[]> = this.targetsSubject.asObservable();

    public userLat: number | null = null;
    public userLng: number | null = null;
    public userGeoHash: string | null = null;
    public watchId: number | null = null;
    public positionMode: PositionMode = 'GPS'; 

    private ngeohash: any;

    // --- SEARCH DATA SOURCES ---
    private searchQuerySubject = new Subject<string>();
    private searchResultsSubject = new BehaviorSubject<SearchResult[]>([]);
    private isSearchingSubject = new BehaviorSubject<boolean>(false);
    
    public searchResults$: Observable<SearchResult[]> = this.searchResultsSubject.asObservable();
    public isSearching$: Observable<boolean> = this.isSearchingSubject.asObservable();

    private searchSubscription: Subscription | null = null;

    readonly zones: MapZone[] = [
        { name: 'KMITL Campus', hash: 'w4rwj', id: 'kmitl_core', zoomLevel: 15 },
        { name: 'KMUTT Campus', hash: 'w4rmw', id: 'kmutt_campus', zoomLevel: 15 },
    ];

    // MERGED DATA: All buildings in one array
    private allTargets: TargetLocation[] = [
        // KMITL
       { name: 'อาคารเรียนรวม 12 ชั้น (E12)', latlng: [13.727549, 100.772554], id: 'kmitl_e12', description: 'ตึกเรียนรวมคณะวิศวกรรมศาสตร์', color: '#007bff' },
        { name: 'คณะเทคโนโลยีสารสนเทศ (IT)', latlng: [13.731107, 100.781045], id: 'kmitl_it', description: 'ตึกกระจกริมน้ำ', color: '#28a745' },
        { name: 'สำนักหอสมุดกลาง (KLLC)', latlng: [13.727624, 100.778683], id: 'kmitl_cl', description: 'ศูนย์การเรียนรู้และห้องสมุด', color: '#ffc107' },
        { name: 'สำนักงานอธิการบดี', latlng: [13.731022, 100.777660], id: 'kmitl_president', description: 'ตึกกรมหลวงนราธิวาสราชนครินทร์', color: '#6f42c1' },
        { name: 'หอประชุมเจ้าพระยาสุรวงษ์ฯ', latlng: [13.726643, 100.779270], id: 'kmitl_hall', description: 'หอประชุมใหญ่ สจล.', color: '#17a2b8' },
        { name: 'คณะสถาปัตยกรรมศาสตร์', latlng: [13.725334, 100.777463], id: 'kmitl_arch', description: 'ริมทางรถไฟ', color: '#fd7e14' },
        { name: 'รพ.พระจอมเกล้าเจ้าคุณทหาร', latlng: [13.732349, 100.789629], id: 'kmitl_hospital', description: 'ศูนย์การแพทย์', color: '#e83e8c' },
        { name: 'อาคารพระเทพฯ (ตึกปฏิบัติการ)', latlng: [13.730024, 100.776838], id: 'kmitl_eng_labs', description: 'ศูนย์ปฏิบัติการวิศวกรรม', color: '#20c997' },
        { name: 'วิทยาลัยนวัตกรรมการผลิตขั้นสูง', latlng: [13.730062, 100.775427], id: 'kmitl_60th', description: 'อาคารเรียนรวม', color: '#343a40' }
,
        // KMUTT
        { name: 'สำนักงานอธิการบดี (ธนบุรี)', latlng: [13.651759, 100.493863], id: 'kmutt_admin', description: 'อาคารสำนักงานใหญ่และบริหาร', color: '#3333ff' },
        { name: 'อาคารเรียนรวม 2 (CB2)', latlng: [13.651034, 100.493010], id: 'kmutt_cb2', description: 'อาคารเรียนรวมพัฒนามิตร', color: '#3333ff' },
        { name: 'อาคารคณะวิศวกรรมศาสตร์', latlng: [13.650890, 100.495015], id: 'kmutt_eng', description: 'ตึกสูงคณะวิศวะ', color: '#3333ff' },
        { name: 'หอประชุมพระจอมเกล้าราชานุสรณ์', latlng: [13.649303, 100.493230], id: 'kmutt_hall', description: 'หอประชุมใหญ่/อาคาร 190 ปี', color: '#3333ff' },
        { name: 'สำนักหอสมุด', latlng: [13.650630, 100.492190], id: 'kmutt_library', description: 'ศูนย์สารสนเทศและห้องสมุด', color: '#3333ff' },
        { name: 'อาคารคณะสถาปัตยกรรมศาสตร์ฯ', latlng: [13.648030, 100.493970], id: 'kmutt_arch', description: 'ตึกสถาปัตย์', color: '#3333ff' },
        { name: 'ศูนย์กีฬา', latlng: [13.647780, 100.491290], id: 'kmutt_sport', description: 'สนามกีฬาหลัก', color: '#3333ff' },
        { name: 'อาคารคณะวิทยาศาสตร์', latlng: [13.652150, 100.494790], id: 'kmutt_science', description: 'ตึกคณะวิทย์', color: '#3333ff' },
        { name: 'อาคารเรียนรวม 4 (CB4)', latlng: [13.653490, 100.493720], id: 'kmutt_cb4', description: 'อาคารเรียนรวม 4 (Energy)', color: '#3333ff' }
    ];

    constructor(@Inject(PLATFORM_ID) private platformId: Object) {
        // Initialize with ALL targets
        this.targetsSubject.next(this.allTargets);
        this.setupSearchStream();
    }

    // --- ICON UTILITIES ---
    public createPinIcon(L: any, hexColor: string): any {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${hexColor}" width="32px" height="32px"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
        return L.icon({ iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`, iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32] });
    }

    public createUserIcon(L: any): any {
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#4285F4" width="48px" height="48px"><circle cx="12" cy="12" r="8" stroke="white" stroke-width="2"/></svg>`;
        return L.icon({ iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`, iconSize: [24, 24], iconAnchor: [12, 12] });
    }

    public createRankedPinIcon(L: any, hexColor: string, rank: number): any {
        const pinPath = "M20 0 C10 0 2 8 2 16 C2 24 10 38 20 40 C30 38 38 24 38 16 C38 8 30 0 20 0 Z";
        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40px" height="40px">
            <path d="${pinPath}" fill="${hexColor}" stroke="white" stroke-width="2"/>
            <text x="20" y="25" font-family="Roboto, sans-serif" font-size="16" fill="white" text-anchor="middle" font-weight="bold">${rank}</text>
        </svg>`;
        return L.icon({ iconUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`, iconSize: [40, 40], iconAnchor: [20, 40], popupAnchor: [0, -38] });
    }

    private getRankedColor(rank: number, total: number): string {
        const maxHue = 120;
        const ratio = (rank - 1) / (total > 1 ? total - 1 : 1);
        const hue = maxHue - (ratio * maxHue); 
        return `hsl(${hue}, 90%, 45%)`;
    }

    // --- PUBLIC METHODS ---

    public async initializeGeoHash() {
        if (isPlatformBrowser(this.platformId)) {
            if (!this.ngeohash) {
                const ngeohashModule = await import('ngeohash');
                this.ngeohash = (ngeohashModule as any).default || ngeohashModule;
            }
        }
    }

    public startGeolocationTracking(L: any) {
        if (!isPlatformBrowser(this.platformId) || !navigator.geolocation) {
            console.error("Geolocation not supported.");
            return;
        }
        const options = { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 };
        this.watchId = navigator.geolocation.watchPosition(
            (pos) => this.handlePositionUpdate(pos, L),
            (err) => console.error("Geolocation error:", err),
            options
        );
    }

    public stopTracking() {
        if (this.watchId !== null) {
            navigator.geolocation.clearWatch(this.watchId);
            this.watchId = null;
        }
        this.userGeoHash = null;
        this.userLat = null;
        this.userLng = null;
        this.targetsSubject.next(this.targetsSubject.getValue()); 
    }

    public setManualPosition(lat: number, lng: number, L: any): void {
        this.userLat = lat;
        this.userLng = lng;
        if (this.isNgeohashInitialized()) {
            this.userGeoHash = this.ngeohash.encode(lat, lng, 8);
        }
        this.updateDistancesAndRanks(L);
    }

    public decodeGeoHashBounds(hash: string): any {
        if (this.isNgeohashInitialized()) { 
            return this.ngeohash.decode_bbox(hash);
        }
        return null;
    }

    public isNgeohashInitialized(): boolean {
        return !!this.ngeohash; 
    }

    // --- SEARCH METHODS ---
    private setupSearchStream() {
        this.searchSubscription = this.searchQuerySubject.pipe(
            debounceTime(400),
            distinctUntilChanged(),
            switchMap(query => {
                if (query.length < 2) {
                    this.searchResultsSubject.next([]);
                    return [];
                }
                this.isSearchingSubject.next(true);
                return this._performSearch(query).pipe(
                    map(results => {
                        this.isSearchingSubject.next(false);
                        return results;
                    })
                );
            })
        ).subscribe(results => {
            this.searchResultsSubject.next(results);
        });
    }

    private _performSearch(query: string): Observable<SearchResult[]> {
        const lowerQuery = query.toLowerCase();
        // Search through ALL targets now
        const targets = this.targetsSubject.getValue();
        const localMatches: SearchResult[] = targets
            .filter(target => target.name.toLowerCase().includes(lowerQuery))
            .map(target => ({
                name: target.name,
                address: target.description || '',
                lat: target.latlng[0],
                lng: target.latlng[1],
                isLocal: true,
                id: target.id 
            }));
        
        return new Observable<SearchResult[]>(observer => {
            setTimeout(() => {
                observer.next(localMatches);
                observer.complete();
            }, 300); 
        });
    }

    public pushSearchQuery(query: string) {
        this.searchQuerySubject.next(query);
    }

    // --- PRIVATE LOGIC ---
    private handlePositionUpdate(pos: GeolocationPosition, L: any): void {
        this.userLat = pos.coords.latitude;
        this.userLng = pos.coords.longitude;
        if (this.isNgeohashInitialized() && this.userLat && this.userLng) {
            this.userGeoHash = this.ngeohash.encode(this.userLat, this.userLng, 8);
        }
        this.updateDistancesAndRanks(L);
    }

    private updateDistancesAndRanks(L: any): void {
        const currentTargets = this.targetsSubject.getValue();
        if (this.userLat === null || this.userLng === null || currentTargets.length === 0) return;

        const userLatLng = L.latLng(this.userLat, this.userLng);
        const totalTargets = currentTargets.length;

        currentTargets.forEach(target => {
            const targetLatLng = L.latLng(target.latlng);
            const distanceMeters = userLatLng.distanceTo(targetLatLng);
            target.distanceText = (distanceMeters < 1000) ? `${Math.round(distanceMeters)} ม.` : `${(distanceMeters / 1000).toFixed(1)} กม.`;
            target.distance = distanceMeters;
        });

        // Sort by distance from user
        const sortedTargets = [...currentTargets].sort((a, b) => (a.distance || 0) - (b.distance || 0));

        sortedTargets.forEach((target, index) => {
            const rank = index + 1;
            target.rank = rank;
            target.color = this.getRankedColor(rank, totalTargets); 
        });
        
        this.targetsSubject.next(sortedTargets);
    }

    ngOnDestroy(): void {
        this.stopTracking();
        if (this.searchSubscription) {
            this.searchSubscription.unsubscribe();
        }
    }
}