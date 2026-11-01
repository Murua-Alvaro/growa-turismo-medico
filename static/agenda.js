/* Small offline-capable calendar utilities; never contacts any external API. */
'use strict';
(function (root) {
  const escapeText = value => String(value == null ? '' : value)
    .replace(/\\/g, '\\\\').replace(/\n/g, '\\n')
    .replace(/;/g, '\\;').replace(/,/g, '\\,');
  function normalized(value) {
    if (!value) return '';
    return String(value).replace(/[-:]/g, '').replace(/\+.*$/, '').replace(/Z$/, '').replace(/\.[0-9]+$/, '');
  }
  function safeEvent(event) {
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(event.start || ''));
    const start = normalized(event.start);
    const end = normalized(event.end || '');
    if (!/^\d{8}(T\d{6})?$/.test(start)) return null;
    const endValue = end || (day ? null : normalized(new Date(new Date(String(event.start)).getTime() + 3600000).toISOString().slice(0, 19)));
    return {title: String(event.title || 'Actividad de itinerario').slice(0, 140),
      day, start, end: endValue, confirmed: /confirmad[oa]/i.test(event.title || '')};
  }
  function ics(events) {
    const rows = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//GROWA//Itinerarios//ES',
      'CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Growa - Itinerario orientativo'];
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    (events || []).forEach((source, index) => {
      const e = safeEvent(source);
      if (!e) return;
      rows.push('BEGIN:VEVENT', 'UID:growa-'+index+'-'+stamp+'@growa.invalid', 'DTSTAMP:'+stamp,
        'SUMMARY:'+escapeText(e.title), 'STATUS:'+(e.confirmed?'CONFIRMED':'TENTATIVE'),
        'DESCRIPTION:'+escapeText('Agenda informativa de Growa; verifica disponibilidad y confirmacion con cada proveedor.'));
      if (e.day) {
        rows.push('DTSTART;VALUE=DATE:'+e.start);
        if (e.end) rows.push('DTEND;VALUE=DATE:'+e.end);
      } else {
        rows.push('DTSTART;TZID=America/Mazatlan:'+e.start);
        if (e.end) rows.push('DTEND;TZID=America/Mazatlan:'+e.end);
      }
      rows.push('END:VEVENT');
    });
    rows.push('END:VCALENDAR');
    return rows.join('\r\n')+'\r\n';
  }
  function download(events) {
    const result = ics(events);
    if (!events || !events.length) return false;
    const blob = new Blob([result], {type:'text/calendar;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href=url; a.download='growa-itinerario.ics';
    a.style.display='none';
    document.body.appendChild(a);
    a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return true;
  }
  function fallback(node, events) {
    node.textContent='';
    const heading=document.createElement('p');
    heading.textContent='Agenda de actividades · Vista simplificada';
    node.appendChild(heading);
    if (!events.length) {
      const empty=document.createElement('p');empty.textContent='No hay actividades para mostrar.';
      node.appendChild(empty);return;
    }
    const list=document.createElement('ul');
    list.className='calendar-fallback-list';
    events.forEach(event=>{
      const li=document.createElement('li');
      const time=document.createElement('time');
      time.textContent=String(event.start||'').replace('T',' ');
      const label=document.createElement('strong');
      label.textContent=String(event.title||'Actividad');
      li.append(time,label);list.appendChild(li);
    });
    node.appendChild(list);
  }
  root.GrowaAgenda = Object.freeze({ics,download,fallback});
})(window);
