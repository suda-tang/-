// Photo-informed exhibition composition, not a cadastral map of Suzhou.
// Canal/street pairs and rear courtyards follow the spatial typology of Pingjiang and Shantang.
export const districtCanals=[
 {name:'western-water-street',width:5.2,points:[[-232,-320],[-199,-307],[-180,-285],[-176,-255],[-179,-226],[-179,-199],[-166,-176],[-149,-158],[-145,-136],[-132,-113],[-108,-89],[-75,-72],[-39,-52],[-32,-20],[-35,22]]},
 {name:'eastern-water-street',width:4.8,points:[[40,-331],[25,-302],[23,-270],[26,-236],[30,-202],[35,-169],[42,-136],[43,-102],[41,-69],[46,-34],[65,4],[94,30]]},
 {name:'southern-cross-canal',width:4.2,points:[[-232,-320],[-195,-321],[-153,-313],[-111,-310],[-68,-311],[-24,-318],[25,-326],[60,-325]]},
 {name:'northern-cross-canal',width:4.2,points:[[-235,-86],[-204,-91],[-173,-98],[-139,-101],[-104,-99],[-70,-98],[-35,-88],[0,-85],[42,-89],[77,-96],[111,-101]]},
 {name:'western-lane-canal',width:3.4,points:[[-239,-279],[-224,-251],[-228,-219],[-217,-189],[-205,-163],[-211,-136],[-204,-108],[-204,-91],[-211,-54],[-190,-24],[-169,12]]},
 {name:'garden-rear-canal',width:3.5,points:[[-224,-251],[-201,-245],[-176,-246]]},
 {name:'western-market-canal',width:3.8,points:[[-217,-189],[-202,-186],[-182,-180],[-166,-176]]},
 {name:'northwest-lane',width:3.2,points:[[-211,-54],[-180,-56],[-151,-50],[-120,-43],[-93,-25],[-72,0],[-35,22]]},
 {name:'east-lane',width:3.3,points:[[42,-136],[70,-145],[99,-137],[122,-118],[111,-101],[117,-70],[100,-38],[65,4]]}
];

export function waterTownFeatures(){return districtCanals.map(c=>({points:c.points,tags:{waterway:'canal',width:c.width/.2,name:c.name}}));}
