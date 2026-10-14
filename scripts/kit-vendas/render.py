import sys,os,asyncio
from playwright.async_api import async_playwright
async def main(html,w,h,png,pdf=None,scale=2):
    async with async_playwright() as p:
        b=await p.chromium.launch()
        pg=await b.new_page(viewport={'width':w,'height':h},device_scale_factor=scale)
        await pg.goto('file://'+os.path.abspath(html)); await pg.wait_for_timeout(600)
        await pg.screenshot(path=png,clip={'x':0,'y':0,'width':w,'height':h})
        if pdf: await pg.pdf(path=pdf,width=f'{w}px',height=f'{h}px',print_background=True)
        await b.close()
a=sys.argv
asyncio.run(main(a[1],int(a[2]),int(a[3]),a[4],a[5] if len(a)>5 and a[5]!='-' else None,float(a[6]) if len(a)>6 else 2))
