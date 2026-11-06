#import "../DesktopMotion.h"
#include <assert.h>

int main(void){@autoreleasepool{
    NSRect screen=NSMakeRect(0,0,1440,900),initial=NSMakeRect(900,100,340,300);
    assert(!MoodShouldDrag(NO,0));assert(!MoodShouldDrag(NO,NSEventModifierFlagShift));assert(MoodShouldDrag(NO,NSEventModifierFlagOption));
    assert(!MoodShouldDrag(NO,NSEventModifierFlagControl));assert(MoodShouldDrag(YES,NSEventModifierFlagShift));
    assert(MoodShouldFollow(YES,YES,YES,NO,0));
    assert(!MoodShouldFollow(NO,YES,YES,NO,0));assert(!MoodShouldFollow(YES,NO,YES,NO,0));
    assert(!MoodShouldFollow(YES,YES,NO,NO,0));assert(!MoodShouldFollow(YES,YES,YES,YES,0));assert(!MoodShouldFollow(YES,YES,YES,NO,1));
    for(int edge=0;edge<5;edge++){
        NSPoint cursor=edge==0?NSMakePoint(10,10):edge==1?NSMakePoint(1439,899):edge==2?NSMakePoint(10,899):edge==3?NSMakePoint(1439,10):NSMakePoint(600,450);
        NSRect frame=initial;
        for(int i=0;i<250;i++){
            NSPoint next=MoodFollowOrigin(frame,screen,cursor,.05,NO);
            assert(isfinite(next.x)&&isfinite(next.y));assert(hypot(next.x-frame.origin.x,next.y-frame.origin.y)<=28.001);
            frame.origin=next;assert(NSContainsRect(screen,frame));
        }
    }
    assert(NSEqualPoints(MoodFollowOrigin(initial,screen,NSMakePoint(1000,200),.05,NO),initial.origin));
    assert(NSEqualPoints(MoodFollowOrigin(initial,screen,NSMakePoint(NAN,200),.05,NO),initial.origin));
    assert(NSEqualPoints(MoodFollowOrigin(initial,screen,NSMakePoint(50,200),0,NO),initial.origin));
    NSPoint slow=MoodFollowOrigin(initial,screen,NSMakePoint(50,200),.05,YES);
    assert(hypot(slow.x-initial.origin.x,slow.y-initial.origin.y)<=9.001);
    NSRect left=NSMakeRect(-1440,0,1440,900);NSPoint cross=MoodFollowOrigin(initial,left,NSMakePoint(-1100,500),.05,NO);
    assert(NSContainsRect(left,NSMakeRect(cross.x,cross.y,340,300)));
    NSRect centered=NSMakeRect(550,300,340,300);
    for(int i=-10;i<=50;i++){
        CGFloat scale=i*.1;NSRect result=MoodDesktopFrame(centered,screen,scale);
        assert(NSContainsRect(screen,result));assert(result.size.width>=170&&result.size.width<=680);
        assert(fabs(result.size.width/result.size.height-340./300.)<.01);
        NSPoint origin=MoodFollowOrigin(result,screen,NSMakePoint(10,10),.05,NO);
        assert(NSContainsRect(screen,NSMakeRect(origin.x,origin.y,result.size.width,result.size.height)));
    }
    NSRect small=MoodDesktopFrame(centered,screen,.5),big=MoodDesktopFrame(centered,screen,2);
    assert(small.size.width==170&&big.size.width==680);
    assert(NSMidX(small)==NSMidX(centered)&&NSMidY(big)==NSMidY(centered));
    NSRect corner=MoodDesktopFrame(NSMakeRect(1200,750,170,150),screen,2);assert(NSContainsRect(screen,corner));
    assert(NSEqualRects(MoodDesktopFrame(centered,screen,NAN),centered));
    NSRect tinyScreen=NSMakeRect(-400,0,400,250),fit=MoodDesktopFrame(centered,tinyScreen,2);assert(NSContainsRect(tinyScreen,fit));
    NSRect second=NSMakeRect(-1920,100,1920,1080);NSPoint transferred=MoodTransferScreen(initial,screen,second);
    assert(NSContainsRect(second,NSMakeRect(transferred.x,transferred.y,initial.size.width,initial.size.height)));
    NSPoint back=MoodTransferScreen(NSMakeRect(transferred.x,transferred.y,340,300),second,screen);
    assert(fabs(back.x-initial.origin.x)<.01&&fabs(back.y-initial.origin.y)<.01);
    puts("PASS: screen transfer retains relative placement across negative-coordinate display and round-trip");
    puts("PASS: scale limits, proportional size, centered zoom, screen-edge clamp, small display fit, resized following");
    puts("PASS: desktop squeeze/Option-drag/Control routing, follow toggle/pause gates, 1250 screen-bound and speed checks, hover stop, invalid input, reduced-motion speed, negative-coordinate display");
}return 0;}
