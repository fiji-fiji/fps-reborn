// Made by tools/hd/pack_offline.py: loads the HD assets packed for file:// (see offline-*.js).
if (location.protocol === 'file:') for (const f of ["offline-1.js", "offline-2.js", "offline-3.js"]) document.write('<script src="assets/hd/' + f + '"><\/script>');
