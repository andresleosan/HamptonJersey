# BUS-24 · Canales aplazados

20-nov-2026, decisión de Luis: se empieza solo con los canales que se pueden leer; los demás se dejan para el final. Lista de dominios (los términos y la evidencia están en el archivo privado del VPS, no aquí). Es un primer filtro automático de robots.txt y términos, no una revisión legal.

## A · Prohibido por sus términos o su robots.txt (13)
No se leen automáticamente. Solo cabe pedir permiso por escrito.

- falcon.je
- huelinhomes.com
- westward.je
- jerseydevelopment.je
- kingsmanoffices.com
- knightfrank.je
- legallais.co.uk
- livingroomproperty.com
- onthemarket.com
- pinnacle.je
- rightmove.co.uk
- savills.je
- spareroom.co.uk

## B · Limitan copiar o el uso comercial (13)
Carga manual o permiso por escrito.

- bridle.je
- broadlandscommercial.com
- castletreehomes.je
- dicasahomes.com
- indigo.je
- lerestates.com
- lyonsestates.co.uk
- mulberry.co.je
- prestige.je
- redproperties.je
- rockproperty.co.uk
- solo.je
- watsonhomes.je

## D · No se pudo leer (20)
Web caída o términos que se cargan con JavaScript. Revisar a mano y reclasificar.

- acjersey.com
- best.je
- cpc.je
- catterson-wood.com
- facebook.com
- forty-eight.co.uk
- hiizzy.com
- jamesedition.com
- loopnet.co.uk
- mansionglobal.com
- palladiumgroupci.com
- primelocation.com
- properstar.com
- quemard.je
- queree.je
- reside.je
- spiffy.je
- coworker.com
- troysjersey.com
- zoopla.co.uk

## E · No son agencias o quedan fuera por política (13)
Agregadores, portales restringidos y webs que no listan vivienda. Places.je y Properties.je solo con permiso escrito; Homely.je nunca.

- aplacecalledyours.com
- apps.apple.com
- businesshub.je
- homesearch.co.uk
- jers3y.com
- jerseyinsight.com
- places.je
- polygon-servicedoffices.co
- properties.je
- property.jerseyeveningpost.com
- propertyskipper.com
- regus.com
- wezoo.com


## Actualización 25-nov-2026 (BUS-19, «Fuera las 34»)

Hasta esta fecha la app seguía teniendo como permitidas para lectura automática 34 fuentes de esta lista (67 canales: grupo A 5, B 12, D 7, E 10). Luis decidió pasarlas todas a «solo manual»: `BUS-19/decisiones-2026-11-25.sql` (detalle en su `.json`). Tras aplicarlo quedan 41 fuentes permitidas. Los demás dominios de la lista no tenían ninguna fuente permitida. Dos canales de Palladium Group (honeycombjersey.com) no están en la lista y salen con su fuente. Para reclasificar una de estas fuentes después, se hace una revisión nueva por canal en el panel.
