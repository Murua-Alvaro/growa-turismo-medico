"""Synthetic demonstration offers. These are never represented as real businesses."""
from datetime import timedelta
from sqlalchemy import select
from .db import Listing, Slot, SessionLocal, now, uid

SAMPLES = [
 ("hotel","Estancias Bahía · DEMO","Hotel con accesibilidad","Marina",23.269,-106.461,1750,1,1,3,"Elevador, suite de estancia prolongada, desayunos y lavandería","https://images.unsplash.com/photo-1566073771259-6a8506099945?w=950&q=85"),
 ("hotel","Casa Vista Pacífico · DEMO","Suites","Zona Dorada",23.248,-106.450,1250,0,1,2,"Apartamento con cocina, lavandería y conexión Wi-Fi","https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=950&q=85"),
 ("hotel","Residencias Marina · DEMO","Departamento temporal","Sábalo Country",23.272,-106.462,2200,1,0,2,"Espacio de estancia extendida con cocina y elevador sujeto a confirmación","https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=950&q=85"),
 ("medico","Consulta de medicina interna · DEMO","Medicina interna","Centro",23.215,-106.428,980,1,1,1,"Directorio de profesionales independientes; horarios ficticios para demostración","https://images.unsplash.com/photo-1551076805-e1869033e561?w=950&q=85"),
 ("medico","Consulta de rehabilitación · DEMO","Rehabilitación","Zona Dorada",23.241,-106.448,820,1,0,1,"Valoración por especialista independiente, con cita confirmada por prestador","https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=950&q=85"),
 ("medico","Consulta odontológica · DEMO","Odontología","Marina",23.27,-106.453,1250,1,1,1,"Agenda de ejemplo. No representa una clínica real ni un cupo verificable","https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=950&q=85"),
 ("transporte","Traslado ejecutivo · DEMO","Vehículo privado","Marina",23.262,-106.451,720,1,1,2,"Recogida en aeropuerto, hotel y consultorio; precio ilustrativo","https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=950&q=85"),
 ("transporte","Movilidad accesible · DEMO","Transporte adaptado","Centro",23.222,-106.430,890,1,0,1,"Unidad adaptada sujeta a certificación y validación del operador","https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=950&q=85"),
 ("negocio","Cocina Local · DEMO","Alimentación","Centro",23.211,-106.421,270,1,1,12,"Restauración y entregas compatibles con preferencias del visitante","https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=950&q=85"),
 ("negocio","Servicios Marina · DEMO","Lavandería","Marina",23.270,-106.458,180,1,0,8,"Lavandería y servicios para acompañantes durante estancias largas","https://images.unsplash.com/photo-1521656693074-0ef32e80a5d5?w=950&q=85"),
]

def seed_demo():
    with SessionLocal.begin() as db:
        if db.scalar(select(Listing.id).limit(1)):
            return
        medical_ids = []
        for kind,name,subtype,zone,lat,lng,price,accessible,english,capacity,description,img in SAMPLES:
            item = Listing(id=uid(),category=kind,name=name,subtype=subtype,zone=zone,latitude=lat,longitude=lng,
                           price_mxn=price,accessible=bool(accessible),english=bool(english),capacity=capacity,
                           description=description,image_url=img,verified=False,demo=True)
            db.add(item)
            if kind == "medico": medical_ids.append(item.id)
        today = now().date()
        for offset in range(1,46):
            day = today + timedelta(days=offset)
            if day.weekday() >= 5: continue
            for medical_id in medical_ids:
                for hhmm in ("09:00","10:30","12:00","15:30"):
                    db.add(Slot(listing_id=medical_id,slot_date=day,time_hhmm=hhmm,source="synthetic"))
