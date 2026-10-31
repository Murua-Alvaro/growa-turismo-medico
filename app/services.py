"""Supplier filtering, coordinated availability and capacity-safe reservations."""
from __future__ import annotations
from datetime import date, datetime, time, timedelta
from math import atan2, cos, radians, sin, sqrt
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .db import Audit, Booking, BookingLeg, Listing, Slot, User, now, uid

KINDS = {"hotel", "medico", "transporte", "negocio"}

def public_listing(item: Listing) -> dict:
    return {"id":item.id, "category":item.category, "name":item.name,
            "subtype":item.subtype, "zone":item.zone, "description":item.description,
            "latitude":item.latitude, "longitude":item.longitude,
            "price_mxn":item.price_mxn, "accessible":item.accessible,
            "english":item.english, "verified":item.verified and not item.demo,
            "demo":item.demo, "capacity":item.capacity, "image_url":item.image_url,
            "contact_url":item.contact_url if not item.demo else ""}

def search_catalog(db: Session, category="all", q="", zone="", max_price=0,
                   accessible=False, english=False, verified=False):
    stmt = select(Listing).where(Listing.active.is_(True))
    if category != "all":
        if category not in KINDS: raise HTTPException(422,"Categoría no válida.")
        stmt = stmt.where(Listing.category == category)
    if q:
        term = "%" + q.strip().lower()[:90] + "%"
        stmt = stmt.where(func.lower(Listing.name).like(term) | func.lower(Listing.subtype).like(term) |
                          func.lower(Listing.description).like(term))
    if zone: stmt = stmt.where(Listing.zone == zone)
    if max_price: stmt = stmt.where(Listing.price_mxn <= max_price)
    if accessible: stmt = stmt.where(Listing.accessible.is_(True))
    if english: stmt = stmt.where(Listing.english.is_(True))
    if verified: stmt = stmt.where(Listing.verified.is_(True),Listing.demo.is_(False))
    return [public_listing(x) for x in db.scalars(stmt.order_by(Listing.category,Listing.name).limit(250))]

def distance_km(a:Listing,b:Listing) -> float:
    r=6371.0
    la1,lo1,la2,lo2=map(radians,[a.latitude,a.longitude,b.latitude,b.longitude])
    dlat=la2-la1;dlon=lo2-lo1
    return 2*r*atan2(sqrt(sin(dlat/2)**2+cos(la1)*cos(la2)*sin(dlon/2)**2),
                     sqrt(1-(sin(dlat/2)**2+cos(la1)*cos(la2)*sin(dlon/2)**2)))

def live_booking_predicate():
    return ((Booking.status == "confirmed") | ((Booking.status.in_(["pending","requires_review"])) & (Booking.expires_at > now())))

def occupied(db:Session,listing:Listing,starts:datetime,ends:datetime) -> int:
    return db.scalar(select(func.count(BookingLeg.id)).join(Booking,Booking.id==BookingLeg.booking_id)
        .where(BookingLeg.listing_id==listing.id,BookingLeg.starts_at<ends,BookingLeg.ends_at>starts,
               BookingLeg.status.in_(["pending","confirmed"]),live_booking_predicate())) or 0

def range_for(kind:str,day:date,hour:str,nights:int):
    appointment=datetime.combine(day,time.fromisoformat(hour))
    if kind=="medico":return appointment,appointment+timedelta(minutes=60)
    if kind=="hotel":
        checkin=datetime.combine(day-timedelta(days=1),time(15,0))
        checkout=datetime.combine(day-timedelta(days=1)+timedelta(days=nights),time(11,0))
        return checkin,checkout
    if kind=="transporte":
        return appointment-timedelta(minutes=50),appointment+timedelta(minutes=95)
    raise ValueError("Unknown resource kind")

def available(db,listing:Listing,starts:datetime,ends:datetime) -> bool:
    return occupied(db,listing,starts,ends) < listing.capacity

def validate_day(day:date):
    if day < now().date() or day > now().date()+timedelta(days=365):
        raise HTTPException(422,"La fecha debe encontrarse dentro de los próximos 365 días.")

def offer_price(med:Listing,hotel:Listing,trans:Listing,nights:int)->int:
    return med.price_mxn + hotel.price_mxn*nights + trans.price_mxn

def feasible(db, med:Listing,hotel:Listing,trans:Listing,slot:Slot,nights:int,guests:int=1)->bool:
    if not slot.enabled or slot.listing_id!=med.id or guests<1 or guests>12:return False
    if hotel.capacity<1 or trans.capacity<1:return False
    for item in (med,hotel,trans):
        if not item.active:return False
        s,e=range_for(item.category,slot.slot_date,slot.time_hhmm,nights)
        if not available(db,item,s,e):return False
    return True

def plan(db:Session, medical_id:str, day:date, nights:int, preferred_hour:int,
         max_budget:int, accessible:bool, hotel_id=None, transport_id=None,
         max_results:int=18) -> dict:
    validate_day(day)
    med=db.get(Listing,medical_id)
    if not med or med.category!="medico" or not med.active:
        raise HTTPException(404,"Servicio médico no encontrado.")
    slots=list(db.scalars(select(Slot).where(Slot.listing_id==med.id,
             Slot.slot_date==day,Slot.enabled.is_(True)).order_by(Slot.time_hhmm)))
    hotels=list(db.scalars(select(Listing).where(Listing.category=="hotel",Listing.active.is_(True))))
    transports=list(db.scalars(select(Listing).where(Listing.category=="transporte",Listing.active.is_(True))))
    if hotel_id: hotels=[h for h in hotels if h.id==hotel_id]
    if transport_id: transports=[t for t in transports if t.id==transport_id]
    if accessible:
        if not med.accessible:return {"options":[],"total_feasible":0,"notice":"No hay prestador accesible para la selección."}
        hotels=[h for h in hotels if h.accessible]
        transports=[t for t in transports if t.accessible]

    # Availability must be evaluated once per resource/time window, not once per
    # Cartesian-product combination; relevant for larger multi-provider catalogs.
    hotel_cache={}
    for hotel in hotels:
        start,end=range_for("hotel",day,slots[0].time_hhmm if slots else "10:00",nights)
        hotel_cache[hotel.id]=available(db,hotel,start,end)
    hotels=[h for h in hotels if hotel_cache[h.id]]
    distance={h.id:round(distance_km(med,h),1) for h in hotels}
    options=[]
    for slot in slots:
        start,end=range_for("medico",day,slot.time_hhmm,nights)
        if not available(db,med,start,end):continue
        valid_transport=[]
        for trans in transports:
            ts,te=range_for("transporte",day,slot.time_hhmm,nights)
            if available(db,trans,ts,te):valid_transport.append(trans)
        for h in hotels:
            for t in valid_transport:
                total=offer_price(med,h,t,nights)
                if max_budget and total>max_budget:continue
                score=100-abs(int(slot.time_hhmm[:2])-preferred_hour)*4-distance[h.id]*2-total/3000
                options.append({"slot_id":slot.id,"medical_id":med.id,"hotel_id":h.id,"transport_id":t.id,
                                "time":slot.time_hhmm,"day":day.isoformat(),"medical":med.name,"hotel":h.name,
                                "transport":t.name,"nights":nights,"price_mxn":total,
                                "distance_km":distance[h.id],"score":round(score,1),"source":slot.source,
                                "demo":med.demo or h.demo or t.demo})
    options.sort(key=lambda x:(-x["score"],x["price_mxn"]))
    return {"options":options[:max_results],"total_feasible":len(options),
            "notice":"Horarios y precios de demostración o declarados por proveedores. Ninguna combinación constituye una reserva externa confirmada."}

def make_booking(db:Session, actor:User, slot_id:str, hotel_id:str, transport_id:str,
                 nights:int,guests:int,alias:str,idempotency_key:str|None=None) -> Booking:
    if idempotency_key:
        existing=db.scalar(select(Booking).where(Booking.created_by==actor.id,Booking.idempotency_key==idempotency_key))
        if existing:return existing
    # PostgreSQL locks supplier inventory rows in a consistent order to prevent double booking.
    slot=db.scalar(select(Slot).where(Slot.id==slot_id).with_for_update())
    if not slot:raise HTTPException(404,"Horario no encontrado.")
    validate_day(slot.slot_date)
    listings={x.id:x for x in db.scalars(select(Listing)
                .where(Listing.id.in_([slot.listing_id,hotel_id,transport_id]))
                .order_by(Listing.id).with_for_update())}
    med=listings.get(slot.listing_id);hotel=listings.get(hotel_id);trans=listings.get(transport_id)
    if not med or not hotel or not trans or (med.category,hotel.category,trans.category)!=("medico","hotel","transporte"):
        raise HTTPException(422,"Combinación de proveedores inválida.")
    if not feasible(db,med,hotel,trans,slot,nights,guests):
        raise HTTPException(409,"Al menos un servicio ya no tiene capacidad. Busca otra alternativa.")
    total=offer_price(med,hotel,trans,nights)
    booking=Booking(created_by=actor.id,guest_alias=alias,medical_id=med.id,hotel_id=hotel.id,
                    transport_id=trans.id,slot_id=slot.id,arrival_date=slot.slot_date-timedelta(days=1),
                    nights=nights,guests=guests,price_mxn=total,status="pending",
                    idempotency_key=idempotency_key,expires_at=now()+timedelta(minutes=25))
    db.add(booking);db.flush()
    for item in (med,hotel,trans):
        s,e=range_for(item.category,slot.slot_date,slot.time_hhmm,nights)
        p=item.price_mxn*(nights if item.category=="hotel" else 1)
        db.add(BookingLeg(booking_id=booking.id,listing_id=item.id,kind=item.category,
                          starts_at=s,ends_at=e,status="pending",price_mxn=p))
    db.add(Audit(user_id=actor.id,action="booking_created",target_id=booking.id))
    db.flush()  # ensure booking legs are visible even with autoflush disabled
    return booking

def booking_view(db:Session,booking:Booking,provider_id=None)->dict:
    legs=list(db.scalars(select(BookingLeg).where(BookingLeg.booking_id==booking.id)
                         .order_by(BookingLeg.starts_at)))
    if provider_id:
        legs=[l for l in legs if db.get(Listing,l.listing_id).provider_user_id==provider_id]
        if not legs:raise HTTPException(403,"No tienes acceso a este itinerario.")
    return {"id":booking.id,"guest_alias":booking.guest_alias,"status":booking.status,
            "medical_id":booking.medical_id,"hotel_id":booking.hotel_id,
            "transport_id":booking.transport_id,"price_mxn":booking.price_mxn,
            "arrival_date":booking.arrival_date.isoformat(),"nights":booking.nights,
            "expires_at":booking.expires_at.isoformat(),"calendar_synced":bool(booking.calendar_event_id),
            "legs":[{"id":l.id,"kind":l.kind,"name":db.get(Listing,l.listing_id).name,
                     "status":l.status,"starts_at":l.starts_at.isoformat(),"ends_at":l.ends_at.isoformat(),
                     "price_mxn":l.price_mxn} for l in legs]}

def change_leg(db:Session,actor:User,leg_id:str,new_status:str)->dict:
    leg=db.scalar(select(BookingLeg).where(BookingLeg.id==leg_id).with_for_update())
    if not leg:raise HTTPException(404,"Componente no encontrado.")
    booking=db.scalar(select(Booking).where(Booking.id==leg.booking_id).with_for_update())
    item=db.get(Listing,leg.listing_id)
    if actor.role=="provider" and item.provider_user_id!=actor.id:
        raise HTTPException(403,"El componente pertenece a otro proveedor.")
    if booking.status not in ("pending","requires_review"):
        raise HTTPException(409,"Itinerario no modificable.")
    if booking.expires_at<=now() and booking.status=="pending":
        booking.status="requires_review"
        raise HTTPException(409,"La solicitud venció. Requiere revisión antes de confirmar.")
    if leg.status!="pending":raise HTTPException(409,"El componente ya fue procesado.")
    leg.status=new_status;leg.confirmed_by=actor.id
    statuses=list(db.scalars(select(BookingLeg.status).where(BookingLeg.booking_id==booking.id,BookingLeg.id!=leg.id)))
    statuses.append(new_status)
    if "rejected" in statuses:booking.status="rejected"
    elif all(x=="confirmed" for x in statuses):booking.status="confirmed"
    else:booking.status="pending"
    db.add(Audit(user_id=actor.id,action="leg_"+new_status,target_id=leg.id))
    return booking_view(db,booking)

def cancel(db:Session,actor:User,booking:Booking):
    if booking.status in ("canceled","rejected"):return
    booking.status="canceled"
    for leg in db.scalars(select(BookingLeg).where(BookingLeg.booking_id==booking.id)):
        if leg.status!="rejected":leg.status="canceled"
    db.add(Audit(user_id=actor.id,action="booking_canceled",target_id=booking.id))
