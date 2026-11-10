#import "Store.h"
#import <ImageIO/ImageIO.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>
#import <CoreGraphics/CoreGraphics.h>

static NSError *Problem(NSString *message) { return [NSError errorWithDomain:@"MoodSlime" code:1 userInfo:@{NSLocalizedDescriptionKey:message}]; }
static NSDictionary *EmptyState(void) {return @{@"version":@1,@"events":@[],@"summaries":@{},@"skin":NSNull.null};}
static BOOL String(id v,NSUInteger limit) {return [v isKindOfClass:NSString.class]&&[v length]<=limit;}
static BOOL Number(id v,double minimum,double maximum) {return [v isKindOfClass:NSNumber.class]&&CFGetTypeID((__bridge CFTypeRef)v)!=CFBooleanGetTypeID()&&isfinite([v doubleValue])&&[v doubleValue]>=minimum&&[v doubleValue]<=maximum;}
static BOOL Integer(id v,double minimum,double maximum) {return Number(v,minimum,maximum)&&floor([v doubleValue])==[v doubleValue];}
static BOOL Day(id value) {if(!String(value,10)||[value length]!=10)return NO;NSDateFormatter *f=[NSDateFormatter new];f.locale=[[NSLocale alloc] initWithLocaleIdentifier:@"en_US_POSIX"];f.dateFormat=@"yyyy-MM-dd";f.lenient=NO;NSDate *d=[f dateFromString:value];return d&&[[f stringFromDate:d] isEqual:value];}
static BOOL Mood(id value) {return String(value,12)&&[@[@"calm",@"happy",@"sad",@"anxious",@"angry",@"tired",@"resigned",@"speechless",@"overwhelmed",@"sleepy"] containsObject:value];}

@implementation MoodStore
- (instancetype)initWithRoot:(NSURL *)root {if((self=[super init]))self.root=root;return self;}
- (NSURL *)file {return [self.root URLByAppendingPathComponent:@"moods.json"];}
- (NSURL *)backup {return [self.root URLByAppendingPathComponent:@"moods.backup.json"];}
+ (BOOL)validState:(id)v {
    if(![v isKindOfClass:NSDictionary.class]||![v[@"version"] isEqual:@1]||![v[@"events"] isKindOfClass:NSArray.class]||[v[@"events"] count]>50000||![v[@"summaries"] isKindOfClass:NSDictionary.class])return NO;
    NSMutableSet *ids=[NSMutableSet new];
    for(id e in v[@"events"]) {
        if(![e isKindOfClass:NSDictionary.class]||!String(e[@"id"],100)||[ids containsObject:e[@"id"]]||!Mood(e[@"mood"])||!Integer(e[@"at"],0,8640000000000000.)||!Day(e[@"day"])||!String(e[@"note"],280)||!Integer(e[@"offset"],-840,840))return NO;
        [ids addObject:e[@"id"]];
    }
    for(id key in v[@"summaries"]) {
        id s=v[@"summaries"][key];
        if(!Day(key)||![s isKindOfClass:NSDictionary.class]||![s[@"day"] isEqual:key]||!Integer(s[@"generatedAt"],0,8640000000000000.)||!String(s[@"text"],1000)||![s[@"counts"] isKindOfClass:NSArray.class]||[s[@"counts"] count]>10)return NO;
        for(id c in s[@"counts"])if(![c isKindOfClass:NSDictionary.class]||!Mood(c[@"mood"])||!Integer(c[@"count"],1,50000))return NO;
    }
    id skin=v[@"skin"];
    if(skin!=NSNull.null) {
        if(![skin isKindOfClass:NSDictionary.class]||!String(skin[@"id"],36)||![[NSUUID alloc] initWithUUIDString:skin[@"id"]]||!String(skin[@"name"],100)||!Integer(skin[@"size"],1,512)||!Integer(skin[@"columns"],1,8)||![skin[@"durations"] isKindOfClass:NSArray.class]||[skin[@"durations"] count]<1||[skin[@"durations"] count]>60)return NO;
        for(id d in skin[@"durations"])if(!Number(d,.02,10))return NO;
    }
    return YES;
}
- (NSDictionary *)read:(NSURL *)url bytes:(NSData **)output {
    NSNumber *size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:NULL];if(size.unsignedLongLongValue>16*1024*1024)return nil;
    NSData *bytes=[NSData dataWithContentsOfURL:url];if(!bytes)return nil;
    id state=[NSJSONSerialization JSONObjectWithData:bytes options:0 error:NULL];
    if(![MoodStore validState:state])return nil;
    if(output)*output=bytes;return state;
}
- (NSDictionary *)load {
    self.readOnly=NO;self.warning=nil;
    if(![NSFileManager.defaultManager fileExistsAtPath:self.file.path]&&![NSFileManager.defaultManager fileExistsAtPath:self.backup.path]) {self.state=EmptyState();self.loadedBytes=nil;return self.state;}
    NSDictionary *state=[self read:self.file bytes:NULL];
    if(state){self.loadedBytes=[NSData dataWithContentsOfURL:self.file];self.state=state;return state;}
    self.readOnly=YES;self.state=[self read:self.backup bytes:NULL]?:EmptyState();
    self.warning=[self.state[@"events"] count]?@"主存档无法读取，正在只读展示上一次备份。原文件未覆盖；请通过「存档位置」检查，并先导出可读记录。":@"存档无法读取，已开启保护模式。原文件未覆盖，暂时不能新增记录；请通过「存档位置」检查。";
    return self.state;
}
- (BOOL)save:(NSDictionary *)state error:(NSError **)error {
    if(self.readOnly||![MoodStore validState:state]) {if(error)*error=Problem(@"存档处于保护模式，或记录格式无效；未覆盖原文件。");return NO;}
    NSData *bytes=[NSJSONSerialization dataWithJSONObject:state options:NSJSONWritingSortedKeys error:error];
    if(!bytes||bytes.length>16*1024*1024) {if(error)*error=Problem(@"存档超过 16 MB，未覆盖原文件。请先导出记录。");return NO;}
    BOOL exists=[NSFileManager.defaultManager fileExistsAtPath:self.file.path];
    NSData *current=exists?[NSData dataWithContentsOfURL:self.file]:nil;
    if((self.loadedBytes&&![current isEqual:self.loadedBytes])||(!self.loadedBytes&&exists)) {self.readOnly=YES;if(error)*error=Problem(@"存档被其他程序修改，已停止写入。请重新打开应用检查。");return NO;}
    if(![NSFileManager.defaultManager createDirectoryAtURL:self.root withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:error])return NO;
    if(self.loadedBytes&&![self.loadedBytes writeToURL:self.backup options:NSDataWritingAtomic error:error])return NO;
    if(![bytes writeToURL:self.file options:NSDataWritingAtomic error:error])return NO;
    [NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:self.file.path error:NULL];
    [NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:self.backup.path error:NULL];
    self.loadedBytes=bytes;self.state=state;return YES;
}
- (NSURL *)skinURL:(NSString *)identifier {return [[self.root URLByAppendingPathComponent:@"Skins" isDirectory:YES] URLByAppendingPathComponent:[identifier stringByAppendingString:@".png"]];}
- (NSString *)skinSource {
    id skin=self.state[@"skin"];if(![skin isKindOfClass:NSDictionary.class])return nil;
    NSURL *url=[self skinURL:skin[@"id"]];NSNumber *size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:NULL];if(!size||size.unsignedLongLongValue>16*1024*1024)return nil;
    NSData *data=[NSData dataWithContentsOfURL:url];return data?[@"data:image/png;base64," stringByAppendingString:[data base64EncodedStringWithOptions:0]]:nil;
}
- (NSDictionary *)importImage:(NSURL *)url error:(NSError **)error {
    NSNumber *size=nil;[url getResourceValue:&size forKey:NSURLFileSizeKey error:error];
    if(!size||size.unsignedLongLongValue>15*1024*1024||size.unsignedLongLongValue<1){if(error)*error=Problem(@"请选择不超过 15 MB 的图片或动图。");return nil;}
    NSData *input=[NSData dataWithContentsOfURL:url options:0 error:error];if(!input)return nil;
    CGImageSourceRef source=CGImageSourceCreateWithData((__bridge CFDataRef)input,(__bridge CFDictionaryRef)@{(__bridge NSString *)kCGImageSourceShouldCache:@NO});
    if(!source){if(error)*error=Problem(@"图片无法解码，请选择 PNG、JPEG、WebP、GIF 或 APNG。");return nil;}
    CFStringRef type=CGImageSourceGetType(source);
    NSArray *allowed=@[@"public.png",@"public.jpeg",@"com.compuserve.gif",@"org.webmproject.webp"];
    NSUInteger count=CGImageSourceGetCount(source);
    if(!type||![allowed containsObject:(__bridge NSString *)type]||count<1||count>60) {CFRelease(source);if(error)*error=Problem(@"文件格式不支持，或动图超过 60 帧；请先缩短动图。");return nil;}
    NSDictionary *first=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,0,NULL));
    double w=[first[(__bridge NSString *)kCGImagePropertyPixelWidth] doubleValue],h=[first[(__bridge NSString *)kCGImagePropertyPixelHeight] doubleValue];
    if(w<1||h<1||w>8192||h>8192||w*h*count>256000000){CFRelease(source);if(error)*error=Problem(@"图片解码尺寸过大；请选择边长不超过 8192 像素、总像素不超过 2.56 亿的文件。");return nil;}
    NSUInteger tile=count>1?256:512,columns=MIN(8,count),rows=(count+columns-1)/columns;
    CGColorSpaceRef space=CGColorSpaceCreateDeviceRGB();
    CGContextRef context=CGBitmapContextCreate(NULL,tile*columns,tile*rows,8,0,space,kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(space);
    if(!context){CFRelease(source);if(error)*error=Problem(@"内存不足，未更换当前皮肤。");return nil;}
    NSMutableArray *durations=[NSMutableArray new];BOOL good=YES;
    for(NSUInteger i=0;i<count;i++) {
        @autoreleasepool {
            NSDictionary *options=@{(__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways:@YES,(__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform:@YES,(__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize:@(tile),(__bridge NSString *)kCGImageSourceShouldCacheImmediately:@YES};
            CGImageRef frame=CGImageSourceCreateThumbnailAtIndex(source,i,(__bridge CFDictionaryRef)options);
            if(!frame){good=NO;break;}
            CGFloat fw=CGImageGetWidth(frame),fh=CGImageGetHeight(frame),scale=MIN(tile/fw,tile/fh);
            CGRect rect=CGRectMake((i%columns)*tile+(tile-fw*scale)/2,(rows-1-i/columns)*tile+(tile-fh*scale)/2,fw*scale,fh*scale);
            CGContextDrawImage(context,rect,frame);CGImageRelease(frame);
            NSDictionary *properties=CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source,i,NULL));
            double duration=.1;
            for(NSString *key in @[@"{GIF}",@"{PNG}",@"{WebP}"]) {NSDictionary *animation=properties[key];if([animation isKindOfClass:NSDictionary.class]){NSNumber *delay=animation[@"UnclampedDelayTime"]?:animation[@"DelayTime"];if(delay)duration=delay.doubleValue;}}
            [durations addObject:@(MAX(.02,MIN(10,isfinite(duration)?duration:.1)))];
        }
    }
    CFRelease(source);
    if(!good){CGContextRelease(context);if(error)*error=Problem(@"动图包含无法解码的帧，未更换当前皮肤。");return nil;}
    CGImageRef atlas=CGBitmapContextCreateImage(context);CGContextRelease(context);
    NSMutableData *png=[NSMutableData new];CGImageDestinationRef destination=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)png,(__bridge CFStringRef)UTTypePNG.identifier,1,NULL);
    if(!destination){CGImageRelease(atlas);if(error)*error=Problem(@"无法创建皮肤图集。");return nil;}
    CGImageDestinationAddImage(destination,atlas,NULL);BOOL finalized=CGImageDestinationFinalize(destination);CFRelease(destination);CGImageRelease(atlas);
    if(!finalized||png.length>16*1024*1024){if(error)*error=Problem(@"皮肤图集过大或编码失败，未更换当前皮肤。");return nil;}
    NSString *identifier=NSUUID.UUID.UUIDString;
    NSURL *output=[self skinURL:identifier];
    if(![NSFileManager.defaultManager createDirectoryAtURL:output.URLByDeletingLastPathComponent withIntermediateDirectories:YES attributes:@{NSFilePosixPermissions:@0700} error:error]||![png writeToURL:output options:NSDataWritingAtomic error:error])return nil;
    [NSFileManager.defaultManager setAttributes:@{NSFilePosixPermissions:@0600} ofItemAtPath:output.path error:NULL];
    NSString *name=url.lastPathComponent.stringByDeletingPathExtension;if(name.length>80)name=[name substringToIndex:80];
    return @{@"ok":@YES,@"skin":@{@"id":identifier,@"name":name,@"size":@(tile),@"columns":@(columns),@"durations":durations},@"source":[@"data:image/png;base64," stringByAppendingString:[png base64EncodedStringWithOptions:0]]};
}
@end

BOOL WriteSyntheticGIF(NSURL *url) {
    NSMutableData *gif=[NSMutableData new];CGImageDestinationRef dest=CGImageDestinationCreateWithData((__bridge CFMutableDataRef)gif,CFSTR("com.compuserve.gif"),2,NULL);
    CGColorSpaceRef rgb=CGColorSpaceCreateDeviceRGB();CGContextRef ctx=CGBitmapContextCreate(NULL,20,20,8,0,rgb,kCGImageAlphaPremultipliedLast);CGColorSpaceRelease(rgb);
    for(int i=0;i<2;i++){CGContextSetRGBFillColor(ctx,i?0:1,i?1:0,0,1);CGContextFillRect(ctx,CGRectMake(0,0,20,20));CGImageRef frame=CGBitmapContextCreateImage(ctx);CGImageDestinationAddImage(dest,frame,(__bridge CFDictionaryRef)@{@"{GIF}":@{@"DelayTime":@(i?.2:.1)}});CGImageRelease(frame);}BOOL finalized=CGImageDestinationFinalize(dest);CFRelease(dest);CGContextRelease(ctx);
    return finalized&&[gif writeToURL:url atomically:YES];
}

BOOL RunStorageTests(void) {
    NSURL *root=[NSURL fileURLWithPath:[NSTemporaryDirectory() stringByAppendingPathComponent:[@"mood-slime-storage-" stringByAppendingString:NSUUID.UUID.UUIDString]]];
    MoodStore *s=[[MoodStore alloc] initWithRoot:root];[s load];NSError *error=nil;
    BOOL ok=YES;
    #define CHECK(expr, label) if(!(expr)){fprintf(stderr,"FAIL: %s\n",label);ok=NO;goto done;}
    CHECK([s save:EmptyState() error:&error],"first atomic save");
    {NSMutableDictionary *state=[EmptyState() mutableCopy];state[@"events"]=@[@{@"id":@"synthetic-1",@"mood":@"happy",@"at":@1793750400000,@"day":@"2026-11-04",@"note":@"合成测试",@"offset":@(-480)}];
    CHECK([s save:state error:&error],"second atomic save");
    MoodStore *reload=[[MoodStore alloc] initWithRoot:root];CHECK([[reload load][@"events"] count]==1,"persistent reload");
    NSData *bytes=[NSData dataWithContentsOfURL:[root URLByAppendingPathComponent:@"moods.json"]];
    NSMutableDictionary *bad=[state mutableCopy];bad[@"events"]=@[@{@"mood":@"unknown"}];CHECK(![s save:bad error:&error],"reject malformed state");
    CHECK([[NSData dataWithContentsOfURL:[root URLByAppendingPathComponent:@"moods.json"]] isEqual:bytes],"invalid save preserves original");
    [@"broken" writeToURL:[root URLByAppendingPathComponent:@"moods.json"] atomically:YES encoding:NSUTF8StringEncoding error:NULL];
    CHECK(![s save:state error:&error],"external edit protection");
    MoodStore *damaged=[[MoodStore alloc] initWithRoot:root];[damaged load];CHECK(damaged.readOnly&&[damaged.state[@"events"] count]==0,"corrupt primary read-only backup");
    CHECK(![damaged save:state error:&error],"corrupt primary never overwritten");
    CHECK([[[NSString alloc] initWithContentsOfURL:[root URLByAppendingPathComponent:@"moods.json"] encoding:NSUTF8StringEncoding error:NULL] isEqual:@"broken"],"corrupt bytes preserved");
    [NSFileManager.defaultManager removeItemAtURL:[root URLByAppendingPathComponent:@"moods.json"] error:NULL];MoodStore *missing=[[MoodStore alloc] initWithRoot:root];[missing load];CHECK(missing.readOnly,"missing primary with existing backup never starts fresh");
    NSURL *blocked=[root URLByAppendingPathComponent:@"blocked"];[@"synthetic file" writeToURL:blocked atomically:YES encoding:NSUTF8StringEncoding error:NULL];MoodStore *failure=[[MoodStore alloc] initWithRoot:blocked];[failure load];CHECK(![failure save:EmptyState() error:&error]&&error,"I/O failure is reported");}
    {NSURL *imageURL=[root URLByAppendingPathComponent:@"synthetic.gif"];
    CHECK(WriteSyntheticGIF(imageURL),"synthetic animated GIF fixture");
    NSDictionary *imported=[s importImage:imageURL error:&error];CHECK(imported&&[imported[@"skin"][@"durations"] count]==2,"animated image imports all frames");
    CHECK(fabs([imported[@"skin"][@"durations"][1] doubleValue]-.2)<.01,"frame durations preserved");
    NSURL *invalid=[root URLByAppendingPathComponent:@"fake.png"];[@"<script>invalid</script>" writeToURL:invalid atomically:YES encoding:NSUTF8StringEncoding error:NULL];CHECK(![s importImage:invalid error:&error],"reject fake image contents");}
    {MoodStore *eight=[[MoodStore alloc] initWithRoot:[root URLByAppendingPathComponent:@"eight-moods"]];[eight load];
    NSMutableDictionary *state=[EmptyState() mutableCopy];NSMutableArray *events=[NSMutableArray new],*counts=[NSMutableArray new];
    for(NSString *mood in @[@"calm",@"happy",@"sad",@"anxious",@"angry",@"tired",@"resigned",@"speechless",@"overwhelmed",@"sleepy"]){
        [events addObject:@{@"id":[@"synthetic-" stringByAppendingString:mood],@"mood":mood,@"at":@1793750400000,@"day":@"2026-11-04",@"note":@"synthetic",@"offset":@(-480)}];
        [counts addObject:@{@"mood":mood,@"count":@1}];
    }
    state[@"events"]=events;state[@"summaries"]=@{@"2026-11-04":@{@"day":@"2026-11-04",@"generatedAt":@1793836800000,@"text":@"synthetic eight-mood recap",@"counts":counts}};
    CHECK([eight save:state error:&error],"ten mood events and recap persist");
    MoodStore *reload=[[MoodStore alloc] initWithRoot:eight.root];NSDictionary *loaded=[reload load];
    CHECK(!reload.readOnly&&[loaded[@"events"] count]==10&&[loaded[@"summaries"][@"2026-11-04"][@"counts"] count]==10,"all ten moods and counts reload without protection mode");}
done:
    [NSFileManager.defaultManager removeItemAtURL:root error:NULL];
    if(ok)puts("PASS: atomic save, backup, persistence reload, malformed state, concurrent edit, corruption preservation, GIF decode/timing, fake image rejection, ten mood events/recap reload");
    return ok;
}
