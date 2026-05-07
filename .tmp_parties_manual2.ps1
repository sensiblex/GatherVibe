$ErrorActionPreference = 'Stop'
$base = 'http://localhost:8000'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
function CallJson($method, $url, $body=$null, $token=$null) { $headers=@{}; if($token){$headers['Authorization']="Bearer $token"}; try { if($null -ne $body){$resp=Invoke-RestMethod -Method $method -Uri $url -ContentType 'application/json' -Headers $headers -Body ($body|ConvertTo-Json -Depth 10)} else {$resp=Invoke-RestMethod -Method $method -Uri $url -Headers $headers}; return [ordered]@{ok=$true;status=200;body=$resp} } catch { $status=$_.Exception.Response.StatusCode.value__; $txt=''; try{$sr=New-Object IO.StreamReader($_.Exception.Response.GetResponseStream());$txt=$sr.ReadToEnd()}catch{}; return [ordered]@{ok=$false;status=$status;raw=$txt} } }
$uA=[ordered]@{ email="party.a.$ts@example.com"; username="partya$ts"; password='Password123!'; city='Moscow'; interests='music' }
$uB=[ordered]@{ email="party.b.$ts@example.com"; username="partyb$ts"; password='Password123!'; city='Moscow'; interests='sport' }
$uC=[ordered]@{ email="party.c.$ts@example.com"; username="partyc$ts"; password='Password123!'; city='SPb'; interests='art' }
$users=@($uA,$uB,$uC)
foreach($u in $users){ $r=CallJson 'Post' "$base/register" $u; if(-not $r.ok){ throw "register failed $($u.email) $($r.status) $($r.raw)" } }
$emails = ($users | ForEach-Object { "'" + $_.email + "'" }) -join ','
$verifySql = "UPDATE users SET is_verified=true, verification_token=NULL WHERE email IN ($emails);"
& docker exec gathervibe_db psql -U gathervibe_user -d gathervibe_db -c $verifySql | Out-Null
Start-Sleep -Seconds 65
$loginA=CallJson 'Post' "$base/login" @{email=$uA.email;password=$uA.password}
$loginB=CallJson 'Post' "$base/login" @{email=$uB.email;password=$uB.password}
$loginC=CallJson 'Post' "$base/login" @{email=$uC.email;password=$uC.password}
if(-not $loginA.ok -or -not $loginB.ok -or -not $loginC.ok){ throw "login failed A=$($loginA.status) B=$($loginB.status) C=$($loginC.status)" }
$ta=$loginA.body.access_token; $tb=$loginB.body.access_token; $tc=$loginC.body.access_token
$uidA=$loginA.body.user_id; $uidB=$loginB.body.user_id; $uidC=$loginC.body.user_id
$checks=[ordered]@{}
$checks['4.1.1']=CallJson 'Post' "$base/parties/event/204669" @{title='Party Main';description='desc';max_members=3} $ta
$party1=$checks['4.1.1'].body.id
$checks['4.1.2']=CallJson 'Post' "$base/parties/event/204669" @{title='NoAuth';description='d';max_members=3}
$checks['4.1.3']=CallJson 'Post' "$base/parties/event/204669" @{title='';description='d';max_members=3} $ta
$checks['4.1.4']=CallJson 'Post' "$base/parties/event/204669" @{title=('A'*61);description='d';max_members=3} $ta
$checks['4.1.5']=CallJson 'Post' "$base/parties/event/204669" @{title='Bad';description='d';max_members=1} $ta
$checks['4.2.1']=CallJson 'Patch' "$base/parties/$party1" @{title='Party Main Updated';description='desc2'} $ta
$null=CallJson 'Post' "$base/parties/$party1/join" @{message='join pls'} $tb
$pending=CallJson 'Get' "$base/parties/my-pending-requests" $null $ta; $reqB=$pending.body|Select-Object -First 1
$checks['4.4.1']=CallJson 'Post' "$base/parties/requests/$($reqB.id)/approve" @{} $ta
$checks['4.2.2']=CallJson 'Patch' "$base/parties/$party1" @{max_members=1} $ta
$checks['4.2.4']=CallJson 'Patch' "$base/parties/$party1" @{title='Hack'} $tb
$checks['4.2.3']=CallJson 'Delete' "$base/parties/$party1" $null $ta
$p2=CallJson 'Post' "$base/parties/event/204669" @{title='Party Join';description='join';max_members=3} $ta; $party2=$p2.body.id
$checks['4.3.1']=CallJson 'Post' "$base/parties/$party2/join" @{message='please'} $tb
$checks['4.3.3']=CallJson 'Post' "$base/parties/$party2/join" @{message='again'} $tb
$checks['4.3.4']=CallJson 'Delete' "$base/parties/$party2/leave" $null $tb
$checks['4.3.5']=CallJson 'Delete' "$base/parties/$party2/leave" $null $ta
$checks['4.3.2']=CallJson 'Post' "$base/parties/$party2/close" @{} $ta
$checks['4.3.2b']=CallJson 'Post' "$base/parties/$party2/join" @{message='closed'} $tc
$checks['4.3.1c']=CallJson 'Post' "$base/parties/$party2/join" @{message='c join'} $tc
$pending2=CallJson 'Get' "$base/parties/my-pending-requests" $null $ta; $reqC=($pending2.body|Where-Object{$_.user_id -eq $uidC}|Select-Object -First 1)
$checks['4.4.2']=CallJson 'Post' "$base/parties/requests/$($reqC.id)/reject" @{} $ta
$checks['4.4.3']=CallJson 'Post' "$base/parties/requests/$($reqC.id)/approve" @{} $tb
$p3=CallJson 'Post' "$base/parties/event/204669" @{title='Party Invite';description='inv';max_members=3} $ta; $party3=$p3.body.id
$checks['4.5.1']=CallJson 'Post' "$base/parties/$party3/invite" @{user_id=$uidB;message='invite B'} $ta
$checks['4.5.2']=CallJson 'Post' "$base/parties/$party3/invite" @{user_id=$uidC;message='invite C'} $tb
$invB=CallJson 'Get' "$base/users/me/party-invites" $null $tb; $invBId=$invB.body[0].id
$checks['4.5.4']=CallJson 'Post' "$base/parties/$party3/invites/$invBId/accept" @{} $tb
$checks['4.5.5']=CallJson 'Post' "$base/parties/$party3/invites/$invBId/decline" @{} $tb
$checks['4.5.1c']=CallJson 'Post' "$base/parties/$party3/invite" @{user_id=$uidC;message='invite C'} $ta
$invC=CallJson 'Get' "$base/users/me/party-invites" $null $tc; $invCId=($invC.body|Where-Object{$_.party_id -eq $party3}|Select-Object -First 1).id
$checks['4.6.1']=CallJson 'Post' "$base/parties/$party3/invites/$invCId/accept" @{} $tc
$checks['4.5.3']=CallJson 'Post' "$base/parties/$party3/invite" @{user_id=$uidB;message='full'} $ta
$checks['4.6.2']=CallJson 'Post' "$base/parties/$party3/join" @{message='full'} $tb
$checks['4.6.3']=CallJson 'Patch' "$base/parties/$party3" @{max_members=2} $ta
$p4=CallJson 'Post' "$base/parties/event/204669" @{title='Party Cancel';description='inv';max_members=4} $ta; $party4=$p4.body.id
$null=CallJson 'Post' "$base/parties/$party4/invite" @{user_id=$uidC;message='temp'} $ta
$invC4=CallJson 'Get' "$base/users/me/party-invites" $null $tc; $invC4Id=($invC4.body|Where-Object{$_.party_id -eq $party4}|Select-Object -First 1).id
$checks['4.5.6']=CallJson 'Delete' "$base/parties/$party4/invites/$invC4Id" $null $ta
$checks['4.7.1']=CallJson 'Get' "$base/parties/search?q=Invite&page=1&per_page=20" $null $ta
$checks['4.7.2']=CallJson 'Get' "$base/parties/search?q=&page=1&per_page=20" $null $ta
$checks['4.7.3']=CallJson 'Get' "$base/parties/search?city=Moscow&page=1&per_page=20" $null $ta
$checks['4.7.4']=CallJson 'Get' "$base/parties/search?date_from=2020-01-01T00:00:00&date_to=2100-01-01T00:00:00&page=1&per_page=20" $null $ta
$p3d=CallJson 'Get' "$base/parties/by-id/$party3" $null $ta; $tok=$p3d.body.invite_token
$checks['4.8.1']=if($tok){[ordered]@{ok=$true;status=200;body=@{token=$tok}}}else{[ordered]@{ok=$false;status=0;raw='no token'}}
$checks['4.8.2.preview']=CallJson 'Get' "$base/parties/by-token/$tok"
$checks['4.8.2.join']=CallJson 'Post' "$base/parties/by-token/$tok/join" @{} $tb
$checks['4.8.3']=CallJson 'Get' "$base/parties/by-token/not_a_real_token"
[ordered]@{emails=@($uA.email,$uB.email,$uC.email);ids=@($uidA,$uidB,$uidC);parties=@($party1,$party2,$party3,$party4);checks=$checks}|ConvertTo-Json -Depth 9
