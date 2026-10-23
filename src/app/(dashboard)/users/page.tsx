"use client";

import { FormEvent, useEffect, useState } from "react";
import { Edit3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type U = {
  id: number;
  username: string;
  fullName: string;
  role: string;
  isActive: boolean;
  defaultBranchId: number | null;
  defaultBranch: { name: string } | null;
  lastLoginAt: string | null;
  branchAccess: { branchId: number; isActive: boolean; role: string | null }[];
};
type B = { id: number; name: string; code: string; isActive: boolean };
type Form = { username:string; fullName:string; password:string; role:string; defaultBranchId:string; branchIds:number[]; isActive:boolean };
const EMPTY:Form={username:"",fullName:"",password:"",role:"STAFF",defaultBranchId:"",branchIds:[],isActive:true};

export default function Page() {
  const [rows,setRows]=useState<U[]>([]),[branches,setBranches]=useState<B[]>([]),[form,setForm]=useState<Form>(EMPTY),[edit,setEdit]=useState<number|null>(null),[show,setShow]=useState(false),[err,setErr]=useState(""),[msg,setMsg]=useState("");

  async function load(){
    const [a,b]=await Promise.all([fetch('/api/users',{cache:'no-store'}),fetch('/api/branches',{cache:'no-store'})]);
    const ad=await a.json(),bd=await b.json();
    if(a.ok)setRows(ad);else setErr(ad.error||'Unable to load users');
    if(b.ok)setBranches(bd);
  }
  useEffect(()=>{load()},[]);

  function start(x?:U){
    setErr('');setMsg('');
    if(x){
      const active=x.branchAccess.filter(a=>a.isActive).map(a=>a.branchId);
      setEdit(x.id);setForm({username:x.username,fullName:x.fullName,password:'',role:x.role,defaultBranchId:String(x.defaultBranchId||''),branchIds:active,isActive:x.isActive});
    }else{
      const first=branches.find(b=>b.isActive)?.id;
      setEdit(null);setForm({...EMPTY,defaultBranchId:first?String(first):'',branchIds:first?[first]:[]});
    }
    setShow(true);
  }

  function toggleBranch(id:number){
    setForm(f=>{
      const exists=f.branchIds.includes(id);
      const next=exists?f.branchIds.filter(x=>x!==id):[...f.branchIds,id];
      const defaultId=Number(f.defaultBranchId);
      return {...f,branchIds: next.includes(defaultId)?next:[...next,defaultId].filter(Boolean)};
    });
  }

  async function save(e:FormEvent){
    e.preventDefault();setErr('');setMsg('');
    const defaultId=Number(form.defaultBranchId);
    const branchIds=[...new Set([...form.branchIds,defaultId].filter(Boolean))];
    const r=await fetch(edit?`/api/users/${edit}`:'/api/users',{method:edit?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,defaultBranchId:defaultId,branchIds})});
    const d=await r.json();if(!r.ok){setErr(d.error||'Unable to save user');return}
    setMsg(edit?'User updated.':'User created.');setShow(false);await load();
  }

  return <div className="space-y-6">
    <div className="flex justify-between"><div><h2 className="text-xl font-semibold">Users & Branch Access</h2><p className="text-sm text-muted-foreground">Assign default and additional branches; users can switch only among active assigned branches.</p></div><Button onClick={()=>start()}><Plus className="h-4 w-4"/>Add user</Button></div>
    {err&&<p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{err}</p>}{msg&&<p className="rounded-md border bg-secondary px-4 py-3 text-sm">{msg}</p>}
    {show&&<Card><CardHeader><CardTitle>{edit?'Edit user':'New user'}</CardTitle></CardHeader><CardContent><form onSubmit={save} className="space-y-5"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Field label="Username *"><Input required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></Field>
      <Field label="Full name *"><Input required value={form.fullName} onChange={e=>setForm({...form,fullName:e.target.value})}/></Field>
      <Field label={edit?'New password (optional)':'Password *'}><Input type="password" required={!edit} minLength={8} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></Field>
      <Field label="Role"><select className="h-10 w-full rounded-md border bg-background px-3" value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{['ADMIN','MANAGER','STAFF','CASHIER'].map(x=><option key={x}>{x}</option>)}</select></Field>
      <Field label="Default branch"><select required className="h-10 w-full rounded-md border bg-background px-3" value={form.defaultBranchId} onChange={e=>{const id=Number(e.target.value);setForm({...form,defaultBranchId:e.target.value,branchIds:form.branchIds.includes(id)?form.branchIds:[...form.branchIds,id]})}}><option value="">Select</option>{branches.filter(b=>b.isActive).map(b=><option key={b.id} value={b.id}>{b.code} - {b.name}</option>)}</select></Field>
      <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>Active</label>
    </div>
    <div><Label>Branch access</Label><div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{branches.filter(b=>b.isActive).map(b=><label key={b.id} className="flex items-center gap-2 rounded-md border p-3 text-sm"><input type="checkbox" checked={form.branchIds.includes(b.id)} disabled={String(b.id)===form.defaultBranchId} onChange={()=>toggleBranch(b.id)}/><span><span className="font-medium">{b.name}</span><span className="ml-1 text-xs text-muted-foreground">({b.code})</span>{String(b.id)===form.defaultBranchId&&<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[10px]">Default</span>}</span></label>)}</div></div>
    <div className="flex gap-2"><Button type="submit">Save</Button><Button type="button" variant="outline" onClick={()=>setShow(false)}>Cancel</Button></div></form></CardContent></Card>}
    <Card><CardContent className="pt-5"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-2">Name</th><th>Username</th><th>Role</th><th>Default Branch</th><th>Branch Access</th><th>Last login</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(x=><tr className="border-b" key={x.id}><td className="p-2 font-medium">{x.fullName}</td><td>{x.username}</td><td>{x.role}</td><td>{x.defaultBranch?.name||'—'}</td><td>{x.branchAccess.filter(a=>a.isActive).length}</td><td>{x.lastLoginAt?new Date(x.lastLoginAt).toLocaleString('en-IN'):'Never'}</td><td>{x.isActive?'Active':'Inactive'}</td><td className="text-right"><Button size="sm" variant="ghost" onClick={()=>start(x)}><Edit3 className="h-4 w-4"/>Edit</Button></td></tr>)}</tbody></table></div></CardContent></Card>
  </div>
}
function Field({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>}
