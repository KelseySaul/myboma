import { useMemo, useState } from 'react';
import { Building2, Home, MoreVertical, Pencil, Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Pagination, usePagination } from '@/components/ui/pagination';
import type { Building, Property } from './types';
import { ActionButton, EmptyBlock, FilterChips, Panel, SearchInput, StatusPill, kes } from './ui';

type StatusFilter = 'all' | 'available' | 'rented' | 'booked';

interface PropertiesTabProps {
  properties: Property[];
  buildings: Building[];
  allowBuildings: boolean;
  onFreePlan: boolean;
  tenantName: (emailOrId: string) => string;
  onAdd: () => void;
  onAddBulk: () => void;
  onEdit: (property: Property) => void;
  onDelete: (property: Property) => void;
  onAssign: (property: Property) => void;
  onShareAccess: (property: Property) => void;
  onAddBuilding: () => void;
  onEditBuilding: (building: Building) => void;
  onDeleteBuilding: (building: Building) => void;
  onUpgrade: () => void;
}

export default function PropertiesTab(props: PropertiesTabProps) {
  const { properties, buildings } = props;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [building, setBuilding] = useState('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return properties.filter((p) => {
      if (status !== 'all' && p.status !== status) return false;
      if (building !== 'all' && (building === 'none' ? p.buildingId : p.buildingId !== building)) return false;
      if (!q) return true;
      return [p.title, p.unitNumber, p.location, p.tenantId].some((v) => v?.toLowerCase().includes(q));
    });
  }, [properties, search, status, building]);

  const { pageItems, ...pager } = usePagination(filtered, 12);
  const count = (s: StatusFilter) => (s === 'all' ? properties.length : properties.filter((p) => p.status === s).length);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">Your properties</h1>
          <p className="text-sm text-zinc-500">{count('rented')} occupied · {count('available')} vacant</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton icon={<Plus className="h-4 w-4" />} onClick={props.onAdd}>Add property</ActionButton>
          {props.allowBuildings && (
            <>
              <ActionButton variant="secondary" icon={<Building2 className="h-4 w-4" />} onClick={props.onAddBuilding}>Add building</ActionButton>
              {buildings.length > 0 && <ActionButton variant="secondary" onClick={props.onAddBulk}>Add several units</ActionButton>}
            </>
          )}
        </div>
      </div>

      {props.onFreePlan && (
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">The free plan covers one house. Upgrade to add more units and group them into buildings.</p>
          <ActionButton size="sm" onClick={props.onUpgrade}>Upgrade plan</ActionButton>
        </div>
      )}

      {props.allowBuildings && buildings.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {buildings.map((b) => (
            <div key={b.id} className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-1 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <Building2 className="h-3.5 w-3.5 text-zinc-400" />
              <span className="font-medium text-zinc-800 dark:text-zinc-200">{b.name}</span>
              <span className="text-zinc-400">· {properties.filter((p) => p.buildingId === b.id).length}</span>
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" aria-label={`Options for ${b.name}`} className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><MoreVertical className="h-4 w-4" /></button>} />
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => props.onEditBuilding(b)}><Pencil className="h-4 w-4" /> Rename</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => props.onDeleteBuilding(b)} className="text-red-600"><Trash2 className="h-4 w-4" /> Delete building</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterChips
          value={status}
          onChange={setStatus}
          options={[
            { id: 'all', label: 'All', count: count('all') },
            { id: 'rented', label: 'Occupied', count: count('rented') },
            { id: 'available', label: 'Vacant', count: count('available') },
            { id: 'booked', label: 'Booked', count: count('booked') },
          ]}
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          {props.allowBuildings && buildings.length > 0 && (
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className="h-11 rounded-xl border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Filter by building"
            >
              <option value="all">All buildings</option>
              <option value="none">Not in a building</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <SearchInput value={search} onChange={setSearch} placeholder="Search name, unit or tenant" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Panel>
          {properties.length === 0 ? (
            <EmptyBlock icon={<Home className="h-5 w-5" />} title="No properties yet" body="Add your first house or unit. Vacant ones appear on the public listings." action={<ActionButton icon={<Plus className="h-4 w-4" />} onClick={props.onAdd}>Add property</ActionButton>} />
          ) : (
            <EmptyBlock title="Nothing matches" body="Try a different search or filter." />
          )}
        </Panel>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {pageItems.map((property) => (
              <article key={property.id} className="group overflow-hidden rounded-2xl border border-zinc-200 bg-white transition hover:shadow-lg hover:shadow-zinc-900/5 dark:border-zinc-800 dark:bg-zinc-900">
                <button type="button" onClick={() => props.onEdit(property)} className="relative block aspect-[16/10] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800" aria-label={`Edit ${property.title}`}>
                  {property.images?.[0] ? (
                    <img src={property.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-sm text-zinc-400">No photo yet</span>
                  )}
                  <span className="absolute left-3 top-3"><StatusPill status={property.status} /></span>
                </button>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{property.title}</h3>
                      <p className="truncate text-xs text-zinc-500">
                        {[property.unitNumber && `Unit ${property.unitNumber}`, buildings.find((b) => b.id === property.buildingId)?.name, property.location].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<button type="button" aria-label={`Options for ${property.title}`} className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"><MoreVertical className="h-4 w-4" /></button>} />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => props.onEdit(property)}><Pencil className="h-4 w-4" /> Edit</DropdownMenuItem>
                        {property.status !== 'rented' && <DropdownMenuItem onClick={() => props.onAssign(property)}><UserPlus className="h-4 w-4" /> Assign tenant</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => props.onShareAccess(property)}><Users className="h-4 w-4" /> Add a manager</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => props.onDelete(property)} className="text-red-600"><Trash2 className="h-4 w-4" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                    <p className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-white">
                      {kes(property.price)}
                      <span className="font-normal text-zinc-500">/{property.type === 'bnb' ? 'night' : 'month'}</span>
                    </p>
                    {property.status === 'rented' && property.tenantId ? (
                      <span className="truncate text-xs text-zinc-500">{props.tenantName(property.tenantId)}</span>
                    ) : property.status === 'available' ? (
                      <button type="button" onClick={() => props.onAssign(property)} className="text-xs font-semibold text-zinc-950 underline-offset-4 hover:underline dark:text-white">
                        Assign tenant
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination {...pager} onPageChange={pager.setPage} label="properties" />
        </>
      )}
    </div>
  );
}
